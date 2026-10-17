import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { WorkspaceItem } from '../../database/entities';
import { PrismaWorkspaceRepository } from '../../database/repositories';
import type { PrismaService } from '../../infra/prisma';
import { EmbeddingsService } from '../../infra/embeddings';
import type { QueueService } from '../../infra/queue';
import {
  plainTextToRichText,
  richTextToPlainText,
} from '../../shared/rich-text';
import type { DailyNoteService } from '../daily-notes/daily-note.service';
import { NotesService } from './notes.service';

const at = new Date('2026-10-18T00:00:00Z');

function item(id: string, changes: Partial<WorkspaceItem> = {}): WorkspaceItem {
  const content =
    changes.content ??
    plainTextToRichText(
      changes.kind === 'folder'
        ? ''
        : (changes.text ?? 'A recorded observation'),
    );

  const text = richTextToPlainText(content);

  return {
    id,
    userId: 'owner',
    kind: 'note',
    title: id,
    parentId: null,
    content,
    text,
    revision: 1,
    indexPending: false,
    indexSignature: 'fixture-signature',
    trashedAt: null,
    trashBatchId: null,
    sourceType: 'dashboard',
    createdAt: at,
    updatedAt: at,
    ...changes,
  };
}

function linked(target: string) {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'noteLink', attrs: { target, label: 'Original label' } },
        ],
      },
    ],
  };
}

function setup(
  items: WorkspaceItem[],
  options: {
    daily?: Array<{
      id: string;
      userId: string;
      date: string;
      content: unknown;
      text: string;
      updatedAt: Date;
    }>;
    matches?: Array<{ id: string; passage: string }>;
    embeddingKey?: string;
  } = {},
) {
  const daily = options.daily ?? [];
  const prisma = {
    workspaceItem: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(items.filter((entry) => entry.userId === where.userId)),
    },
    dailyNote: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(daily.filter((entry) => entry.userId === where.userId)),
    },
    $queryRaw: () => Promise.resolve(options.matches ?? []),
  } as unknown as PrismaService;

  const repository = new PrismaWorkspaceRepository(prisma);
  const embeddings = new EmbeddingsService(
    new ConfigService({ BACKEND_MODEL_API_KEY: options.embeddingKey ?? '' }),
  );

  return new NotesService(
    repository,
    embeddings,
    {} as QueueService,
    {} as DailyNoteService,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Notes retrieval and references', () => {
  test('workspace metadata cannot contain another owner’s notes', async () => {
    const notes = setup([
      item('mine'),
      item('private', { userId: 'another-owner' }),
    ]);

    const result = await notes.list('owner');
    expect(result.notes.map((entry) => entry.id)).toEqual(['mine']);
  });

  test('search reads the full body rather than only its preview', async () => {
    const notes = setup([
      item('meeting', {
        text: `${'Opening notes. '.repeat(20)}A specific galaxy observation.`,
      }),
    ]);

    const result = await notes.search('owner', 'galaxy');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'meeting',
        excerpt: expect.stringContaining('galaxy'),
      }),
    ]);
  });

  test('a folder filter includes descendants and excludes unrelated notes', async () => {
    const notes = setup([
      item('work', { kind: 'folder' }),
      item('child', { kind: 'folder', parentId: 'work' }),
      item('nested', { parentId: 'child', text: 'Research observation' }),
      item('other', { text: 'Another observation' }),
    ]);

    const result = await notes.search('owner', 'observation', {
      folderId: 'work',
    });

    expect(result.map((entry) => entry.id)).toEqual(['nested']);
  });

  test('normal search excludes trashed notes even when their wording matches', async () => {
    const notes = setup([
      item('active'),
      item('deleted', { trashedAt: at, trashBatchId: 'batch' }),
    ]);

    const result = await notes.search('owner', 'observation');
    expect(result.map((entry) => entry.id)).toEqual(['active']);
  });

  test('a trashed note cannot be opened through its previous id', async () => {
    const notes = setup([item('deleted', { trashedAt: at })]);
    await expect(notes.find('owner', 'deleted')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('incoming links use stable destination identities after a rename', async () => {
    const notes = setup([
      item('target', { title: 'Renamed destination' }),
      item('source', { content: linked('custom:target') }),
      item('deleted-source', {
        content: linked('custom:target'),
        trashedAt: at,
      }),
    ]);

    const result = await notes.backlinks('owner', 'custom:target');
    expect(result.map((entry) => entry.id)).toEqual(['source']);
  });

  test('a daily note can be an incoming link source for a custom note', async () => {
    const notes = setup([item('target')], {
      daily: [
        {
          id: 'daily-one',
          userId: 'owner',
          date: '2026-10-17',
          content: linked('custom:target'),
          text: 'Original label',
          updatedAt: at,
        },
      ],
    });

    const result = await notes.backlinks('owner', 'custom:target');
    expect(result.map((entry) => entry.ref)).toEqual(['daily:2026-10-17']);
  });

  test('a custom note can be an incoming link source for a daily note', async () => {
    const notes = setup(
      [item('source', { content: linked('daily:2026-10-17') })],
      {
        daily: [
          {
            id: 'daily-one',
            userId: 'owner',
            date: '2026-10-17',
            content: plainTextToRichText('Journal'),
            text: 'Journal',
            updatedAt: at,
          },
        ],
      },
    );

    const result = await notes.backlinks('owner', 'daily:2026-10-17');
    expect(result.map((entry) => entry.ref)).toEqual(['custom:source']);
  });

  test('malformed internal links are rejected instead of breaking future reads', () => {
    const notes = setup([]);
    expect(() =>
      notes.document({
        type: 'doc',
        content: [{ type: 'noteLink', attrs: { label: 'Missing target' } }],
      }),
    ).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
  });

  test('assistant topic search can find a custom note without a literal match', async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.5);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding }] }), {
        status: 200,
      }),
    );
    const notes = setup(
      [item('holiday', { title: 'Liburan', text: 'Pantai dan pesawat' })],
      {
        embeddingKey: 'test-provider-key',
        matches: [{ id: 'holiday', passage: 'Pantai dan pesawat' }],
      },
    );

    const result = await notes.searchForAssistant('owner', 'travel', {
      kind: 'note',
    });

    expect(result.notes.map((entry) => entry.id)).toEqual(['holiday']);
    expect(result.retrievalMode).toBe('hybrid');
  });

  test('unavailable embeddings explicitly report keyword-only assistant retrieval', async () => {
    const notes = setup([
      item('research', { text: 'A specific galaxy observation' }),
    ]);

    const result = await notes.searchForAssistant('owner', 'galaxy', {
      kind: 'note',
    });

    expect(result.retrievalMode).toBe('keyword');
    expect(result.notes.map((entry) => entry.id)).toEqual(['research']);
  });
});
