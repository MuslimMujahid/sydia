import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  WORKSPACE_REPOSITORY,
  type IWorkspaceRepository,
} from '../../database/interfaces';
import type { WorkspaceItem } from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { parseRichTextDocument } from '../../shared/rich-text';
import type { RichTextDocument } from '../../shared/rich-text';
import { indexSignature } from '../../shared/rich-text';
import { chunkText } from '../../shared/text';
import { EmbeddingsService } from '../../infra/embeddings';
import { QueueService } from '../../infra/queue';
import { DailyNoteService } from '../daily-notes/daily-note.service';
import { noteReferences } from '../../shared/rich-text';
import {
  applyWorkspaceCommand,
  descendantIds,
  workspacePath,
  type WorkspaceCommand,
} from './workspace-rules';

export type WorkspaceEntry = {
  ref: string;
  id: string;
  kind: 'note' | 'daily';
  title: string;
  path: string;
  parentId: string | null;
  text: string;
  updatedAt: Date;
};

function entryMetadata(entry: WorkspaceEntry): Omit<WorkspaceEntry, 'text'> {
  return {
    ref: entry.ref,
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    path: entry.path,
    parentId: entry.parentId,
    updatedAt: entry.updatedAt,
  };
}

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: IWorkspaceRepository,
    private readonly embeddings: EmbeddingsService,
    private readonly queue: QueueService,
    private readonly dailyNotes: DailyNoteService,
  ) {}

  private async snapshot(userId: string) {
    const [items, daily] = await Promise.all([
      this.repository.list(userId),
      this.repository.dailyDocuments(userId),
    ]);

    return { items, daily };
  }

  private entries(
    snapshot: Awaited<ReturnType<NotesService['snapshot']>>,
  ): WorkspaceEntry[] {
    const { items, daily } = snapshot;

    return [
      ...items
        .filter((item) => item.kind === 'note' && !item.trashedAt)
        .map((item) => ({
          ref: `custom:${item.id}`,
          id: item.id,
          kind: 'note' as const,
          title: item.title,
          path: workspacePath(item, items),
          parentId: item.parentId,
          text: item.text,
          updatedAt: item.updatedAt,
        })),
      ...daily.map((note) => ({
        ref: `daily:${note.date}`,
        id: note.id,
        kind: 'daily' as const,
        title: note.date,
        path: 'Catatan harian',
        parentId: null,
        text: note.text,
        updatedAt: note.updatedAt,
      })),
    ];
  }

  async list(userId: string) {
    const snapshot = await this.snapshot(userId);

    return {
      items: snapshot.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        parentId: item.parentId,
        revision: item.revision,
        trashedAt: item.trashedAt,
        trashBatchId: item.trashBatchId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceType: item.sourceType,
        path: workspacePath(item, snapshot.items),
      })),
      notes: this.entries(snapshot).map(({ text, ...entry }) => ({
        ...entry,
        excerpt: text.slice(0, 160),
      })),
    };
  }

  async find(userId: string, id: string): Promise<WorkspaceItem> {
    const items = await this.repository.list(userId);
    const item = items.find(
      (entry) => entry.id === id && entry.kind === 'note' && !entry.trashedAt,
    );

    if (!item)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Catatan tidak ditemukan.',
        status: HttpStatus.NOT_FOUND,
      });

    return item;
  }

  async search(
    userId: string,
    query: string,
    options: { kind?: 'note' | 'daily'; folderId?: string } = {},
  ) {
    const snapshot = await this.snapshot(userId);
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    let folders: Set<string> | undefined;

    if (options.folderId) {
      const folder = snapshot.items.find(
        (item) =>
          item.id === options.folderId &&
          item.kind === 'folder' &&
          !item.trashedAt,
      );

      if (!folder)
        throw new ApiException({
          code: ErrorCodes.NOT_FOUND,
          message: 'Folder tidak ditemukan.',
          status: HttpStatus.NOT_FOUND,
        });
      folders = descendantIds(folder.id, snapshot.items);
    }

    return this.entries(snapshot)
      .filter(
        (item) =>
          (!options.kind || item.kind === options.kind) &&
          (!folders ||
            (item.parentId !== null && folders.has(item.parentId))) &&
          (item.title.toLocaleLowerCase().includes(term) ||
            item.text.toLocaleLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          Number(b.title.toLocaleLowerCase().includes(term)) -
            Number(a.title.toLocaleLowerCase().includes(term)) ||
          a.path.localeCompare(b.path),
      )
      .map(({ text, ...entry }) => {
        const index = text.toLocaleLowerCase().indexOf(term);
        const start = Math.max(0, index - 48);

        return { ...entry, excerpt: text.slice(start, start + 180) };
      });
  }

  async backlinks(userId: string, target: string) {
    const snapshot = await this.snapshot(userId);
    const entries = this.entries(snapshot);
    if (!entries.some((entry) => entry.ref === target)) return [];
    const documents = [
      ...snapshot.items
        .filter((item) => item.kind === 'note' && !item.trashedAt)
        .map((item) => ({ ref: `custom:${item.id}`, content: item.content })),
      ...snapshot.daily.map((item) => ({
        ref: `daily:${item.date}`,
        content: item.content,
      })),
    ];

    const sources = new Set(
      documents
        .filter((document) =>
          noteReferences(document.content).some(
            (link) => link.target === target,
          ),
        )
        .map((document) => document.ref),
    );

    return entries.filter((entry) => sources.has(entry.ref)).map(entryMetadata);
  }

  document(value: unknown): RichTextDocument {
    const document = parseRichTextDocument(value);
    if (!document)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Isi catatan tidak valid.',
        status: HttpStatus.BAD_REQUEST,
      });

    try {
      // Validate bounded traversal before accepting content, even without links.
      noteReferences(document);
    } catch (error) {
      this.logger.warn('Rejected invalid note document.', error);
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Isi catatan terlalu besar atau tidak valid.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    return document;
  }

  create(
    userId: string,
    input: {
      kind: 'note' | 'folder';
      title?: string;
      parentId?: string | null;
      requestKey: string;
      content?: unknown;
    },
    sourceType = 'dashboard',
  ) {
    const id = createHash('sha256')
      .update(`${userId}:${input.requestKey}`)
      .digest('hex');

    return this.execute(
      userId,
      {
        action: 'create',
        id,
        kind: input.kind,
        title: input.title,
        parentId: input.parentId ?? null,
        ...(input.content === undefined
          ? {}
          : { content: this.document(input.content) }),
      },
      sourceType,
    );
  }

  update(
    userId: string,
    id: string,
    input: {
      revision: number;
      title?: string;
      parentId?: string | null;
      content?: unknown;
    },
    sourceType = 'dashboard',
  ) {
    return this.execute(
      userId,
      {
        action: 'update',
        id,
        revision: input.revision,
        title: input.title,
        parentId: input.parentId,
        ...(input.content === undefined
          ? {}
          : { content: this.document(input.content) }),
      },
      sourceType,
    );
  }

  async execute(
    userId: string,
    command: WorkspaceCommand,
    sourceType = 'dashboard',
  ) {
    const result = await this.repository.transact(userId, (items) =>
      applyWorkspaceCommand(items, command, {
        userId,
        now: new Date(),
        sourceType,
      }),
    );

    if (result.kind === 'note' && !result.trashedAt && result.indexPending) {
      try {
        await this.queue.dailyNoteIndexes.add(
          'custom-index',
          { kind: 'custom-index', userId, itemId: result.id },
          { jobId: `custom-note-${result.id}-${randomUUID()}` },
        );
      } catch (error) {
        // Durable indexPending is returned with the saved note. The worker's
        // bounded recovery batch repairs queue outages; the document stays saved.
        this.logger.warn(
          `Custom-note index enqueue failed; indexPending=true item=${result.id}`,
          error,
        );
      }
    }

    return result;
  }

  async index(userId: string, id: string): Promise<boolean> {
    const item = (await this.repository.list(userId)).find(
      (entry) => entry.id === id && entry.kind === 'note' && !entry.trashedAt,
    );

    if (!item) return false;
    const model = this.embeddings.modelName();
    const version = this.embeddings.version;
    const signature = indexSignature(
      `${model}\n${version}\n${item.title}\n${item.text}`,
    );

    if (!item.indexPending && item.indexSignature === signature) return true;
    const chunks = chunkText(`${item.title}\n${item.text}`);
    const embedded = await this.embeddings.embedMany(chunks);

    if (embedded.some((value) => value === null)) {
      this.logger.warn(
        `Custom-note topic index deferred; embedding provider unavailable item=${id} indexPending=true`,
      );

      return false;
    }

    const embeddings = embedded.map((value) => {
      if (!value) throw new Error('Missing custom-note chunk embedding.');

      return value;
    });

    const committed = await this.repository.replaceIndex(userId, id, {
      signature,
      model,
      version,
      chunks,
      embeddings,
    });

    if (!committed)
      this.logger.warn(
        `Custom-note index was superseded or trashed; current pending state retained item=${id}`,
      );

    return committed;
  }

  async recoverPending(): Promise<number> {
    const INDEX_RECOVERY_BATCH_LIMIT = 25;
    const pending = await this.repository.pendingIndex(
      INDEX_RECOVERY_BATCH_LIMIT,
    );

    let indexed = 0;

    for (const item of pending) {
      try {
        if (await this.index(item.userId, item.id)) indexed += 1;
      } catch (error) {
        this.logger.warn(
          `Custom-note index recovery failed item=${item.id}; retained for the next bounded sweep.`,
          error,
        );
      }
    }

    return indexed;
  }

  /** Keyword browsing stays separate from assistant topic retrieval. */
  async searchForAssistant(
    userId: string,
    query: string,
    options: { kind?: 'note' | 'daily'; folderId?: string } = {},
  ) {
    const literal = await this.search(userId, query, options);
    const snapshot = await this.snapshot(userId);
    const entries = this.entries(snapshot);
    const scores = new Map<
      string,
      {
        entry: Omit<WorkspaceEntry, 'text'> & { excerpt: string };
        score: number;
      }
    >();

    function add(
      entry: Omit<WorkspaceEntry, 'text'> & { excerpt: string },
      rank: number,
    ) {
      const existing = scores.get(entry.ref);
      scores.set(entry.ref, {
        entry,
        score: (existing?.score ?? 0) + 1 / (60 + rank + 1),
      });
    }

    literal.forEach(add);
    let retrievalMode: 'hybrid' | 'keyword' = 'hybrid';

    if (options.kind !== 'daily') {
      try {
        const embedding = await this.embeddings.embed(
          query.trim().slice(0, 400),
        );

        if (!embedding) {
          retrievalMode = 'keyword';
          this.logger.warn(
            'Custom-note topic search unavailable; returning explicit keyword-only retrieval.',
          );
        } else {
          const matches = await this.repository.searchVector(
            userId,
            embedding,
            this.embeddings.modelName(),
            this.embeddings.version,
            30,
          );

          const allowedFolders = options.folderId
            ? descendantIds(options.folderId, snapshot.items)
            : null;

          const seen = new Set<string>();
          matches.forEach((match, rank) => {
            if (seen.has(match.id)) return;
            seen.add(match.id);
            const entry = entries.find(
              (candidate) =>
                candidate.id === match.id && candidate.kind === 'note',
            );

            if (
              entry &&
              (!allowedFolders ||
                (entry.parentId && allowedFolders.has(entry.parentId)))
            ) {
              add({ ...entryMetadata(entry), excerpt: match.passage }, rank);
            }
          });
        }
      } catch (error) {
        retrievalMode = 'keyword';
        this.logger.warn(
          'Custom-note topic retrieval failed; returning explicit keyword-only retrieval.',
          error,
        );
      }
    }

    if (options.kind !== 'note' && !options.folderId) {
      const daily = await this.dailyNotes.search(userId, query);
      daily.forEach((hit, rank) => {
        const entry = entries.find(
          (candidate) => candidate.ref === `daily:${hit.date}`,
        );

        if (entry) {
          add({ ...entryMetadata(entry), excerpt: hit.content }, rank);
        }
      });
    }

    return {
      notes: [...scores.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ entry }) => entry),
      retrievalMode,
      indexingPending: snapshot.items.some(
        (item) => item.kind === 'note' && !item.trashedAt && item.indexPending,
      ),
    };
  }
}
