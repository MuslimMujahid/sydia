import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { EmbeddingsService } from '../../src/infra/embeddings';
import type { QueueService } from '../../src/infra/queue';
import {
  PrismaDailyNoteRepository,
  PrismaUserRepository,
  PrismaWorkspaceRepository,
} from '../../src/database/repositories';
import { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';
import { NotesService } from '../../src/modules/notes/notes.service';
import { createNotesWorkspaceTools } from '../../src/modules/conversations/services/notes-workspace-tools';
import { createDailyNoteTools } from '../../src/modules/conversations/services/daily-note-tools';
import type { AssistantTool } from '../../src/modules/conversations/services/tool-executor.service';
import {
  plainTextToRichText,
  indexSignature,
} from '../../src/shared/rich-text';
import type { WorkspaceItem } from '../../src/database/entities';

const enabled = process.env.NOTES_CONTRACT_ENABLED === 'true';
type Channel = 'web' | 'telegram' | 'whatsapp';
type Json = ReturnType<AssistantTool['parseArguments']>;

(enabled ? describe : describe.skip)(
  'Notes workspace PostgreSQL and channel tool contract',
  () => {
    let prisma: PrismaService;
    let repository: PrismaWorkspaceRepository;
    let dailyRepository: PrismaDailyNoteRepository;
    let service: NotesService;
    let daily: DailyNoteService;
    let tools: AssistantTool[];
    const owner = `notes-contract-${randomUUID()}`;

    beforeAll(async () => {
      const config = new ConfigService({
        BACKEND_DB_URL: process.env.BACKEND_DB_URL,
        BACKEND_MODEL_API_KEY: '',
      });

      prisma = new PrismaService(config);
      await prisma.user.create({
        data: {
          id: owner,
          name: 'Notes contract',
          email: `${owner}@notes-contract.invalid`,
          timezone: 'Asia/Makassar',
          banned: true,
          automaticMemoryEnabled: false,
        },
      });
      // Redis is the unowned boundary. Durable database/index behavior remains real.
      const queue = {
        dailyNoteIndexes: {
          add: () => Promise.resolve({ id: 'contract-job' }),
        },
      } as unknown as QueueService;

      const embeddings = new EmbeddingsService(config);
      repository = new PrismaWorkspaceRepository(prisma);
      dailyRepository = new PrismaDailyNoteRepository(prisma);
      daily = new DailyNoteService(
        dailyRepository,
        new PrismaUserRepository(prisma),
        embeddings,
        queue,
      );
      service = new NotesService(repository, embeddings, queue, daily);
      tools = [
        ...createNotesWorkspaceTools(service),
        ...createDailyNoteTools({ dailyNotes: daily }),
      ];
    });

    afterAll(async () => {
      await prisma.workspaceItem.updateMany({
        where: { userId: owner },
        data: { parentId: null },
      });
      await prisma.user.delete({ where: { id: owner } });
      await prisma.onModuleDestroy();
    });

    function execute(
      name: string,
      input: Json,
      channel: Channel,
      requestKey = randomUUID(),
    ): Promise<unknown> {
      const tool = tools.find(
        (candidate) => candidate.definition.name === name,
      );

      if (!tool) throw new Error(`Missing registered tool ${name}.`);

      return tool.execute({
        userId: owner,
        sourceMessageId: `contract:${requestKey}`,
        idempotencyKey: requestKey,
        arguments: tool.parseArguments(input),
        context: channel === 'web' ? undefined : { channel },
      });
    }

    async function createFolder(
      title: string,
      channel: Channel,
      parentId?: string,
    ): Promise<WorkspaceItem> {
      return (await execute(
        'manage_notes_item',
        { action: 'create_folder', title, ...(parentId ? { parentId } : {}) },
        channel,
      )) as WorkspaceItem;
    }

    test.each<Channel>(['web', 'telegram', 'whatsapp'])(
      '%s can create, read, edit, move, trash, restore and permanently delete a nested custom note',
      async (channel) => {
        const folder = await createFolder(`Work ${channel}`, channel);
        const child = await createFolder(
          `Projects ${channel}`,
          channel,
          folder.id,
        );

        const requestKey = randomUUID();
        const note = (await execute(
          'create_custom_note',
          {
            title: `Plan ${channel}`,
            parentId: child.id,
            text: 'Initial note',
          },
          channel,
          requestKey,
        )) as WorkspaceItem;

        const replay = (await execute(
          'create_custom_note',
          {
            title: `Plan ${channel}`,
            parentId: child.id,
            text: 'Initial note',
          },
          channel,
          requestKey,
        )) as WorkspaceItem;

        expect(replay.id).toBe(note.id);
        const opened = (await execute(
          'read_custom_note',
          { id: note.id },
          channel,
        )) as WorkspaceItem;

        expect(opened.content).toEqual(plainTextToRichText('Initial note'));
        const content = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Bold text', marks: [{ type: 'bold' }] },
                {
                  type: 'noteLink',
                  attrs: { label: 'Journal', target: 'daily:2026-10-17' },
                },
              ],
            },
          ],
        };

        const edited = (await execute(
          'update_custom_note',
          { id: note.id, revision: opened.revision, content },
          channel,
        )) as WorkspaceItem;

        expect(edited.content).toEqual(content);
        const moved = (await execute(
          'manage_notes_item',
          {
            action: 'move',
            id: note.id,
            revision: edited.revision,
            parentId: null,
          },
          channel,
        )) as WorkspaceItem;

        expect(moved.parentId).toBeNull();
        const renamed = (await execute(
          'manage_notes_item',
          {
            action: 'rename',
            id: note.id,
            revision: moved.revision,
            title: `Renamed ${channel}`,
          },
          channel,
        )) as WorkspaceItem;

        expect(renamed.content).toEqual(content);
        expect(renamed.sourceType).toBe(channel === 'web' ? 'chat' : channel);
        const trashed = (await execute(
          'manage_notes_item',
          { action: 'trash', id: note.id, revision: renamed.revision },
          channel,
        )) as WorkspaceItem;

        await expect(
          execute('read_custom_note', { id: note.id }, channel),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const restored = (await execute(
          'manage_notes_item',
          { action: 'restore', id: note.id, revision: trashed.revision },
          channel,
        )) as WorkspaceItem;

        expect(restored.content).toEqual(content);
        const deleted = (await execute(
          'manage_notes_item',
          { action: 'trash', id: note.id, revision: restored.revision },
          channel,
        )) as WorkspaceItem;

        await expect(
          execute(
            'manage_notes_item',
            { action: 'delete', id: note.id, revision: deleted.revision },
            channel,
          ),
        ).rejects.toThrow('explicit user request');
        await execute(
          'manage_notes_item',
          {
            action: 'delete',
            id: note.id,
            revision: deleted.revision,
            permanentDeletionRequested: true,
          },
          channel,
        );
        expect(
          await prisma.workspaceItem.findUnique({ where: { id: note.id } }),
        ).toBeNull();
      },
    );

    test.each<Channel>(['web', 'telegram', 'whatsapp'])(
      '%s note search resolves body text and excludes Trash',
      async (channel) => {
        const folder = await createFolder(`Search ${channel}`, channel);
        const note = (await execute(
          'create_custom_note',
          {
            title: `Findable ${channel}`,
            parentId: folder.id,
            text: 'A very specific discovery',
          },
          channel,
        )) as WorkspaceItem;

        const result = (await execute(
          'search_notes',
          { query: 'discovery', folderId: folder.id, kind: 'note' },
          channel,
        )) as { notes: Array<{ id: string }>; retrievalMode: string };

        expect(result.notes.map((entry) => entry.id)).toEqual([note.id]);
        expect(result.retrievalMode).toBe('keyword');
        await execute(
          'manage_notes_item',
          { action: 'trash', id: note.id, revision: note.revision },
          channel,
        );
        const after = (await execute(
          'search_notes',
          { query: 'discovery', folderId: folder.id, kind: 'note' },
          channel,
        )) as { notes: unknown[] };

        expect(after.notes).toEqual([]);
      },
    );

    test('daily-note indexing does not invalidate the version returned by a content save', async () => {
      const original = await daily.save(owner, {
        date: '2026-10-16',
        document: plainTextToRichText('Original daily note'),
        expectedUpdatedAt: null,
      });

      if (!original) throw new Error('Expected saved daily note.');
      await dailyRepository.replaceChunks(owner, original.date, {
        signature: indexSignature(original.text),
        chunks: [original.text],
      });
      const indexed = await daily.findByDate(owner, original.date);
      expect(indexed?.updatedAt).toEqual(original.updatedAt);
      const saved = await daily.save(owner, {
        date: original.date,
        document: plainTextToRichText('Next edit'),
        expectedUpdatedAt: original.updatedAt,
      });

      expect(saved?.text).toBe('Next edit');
      await expect(
        daily.save(owner, {
          date: original.date,
          document: plainTextToRichText('Stale edit'),
          expectedUpdatedAt: original.updatedAt,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    test('a real vector index preserves edit revision and excludes stale or trashed chunks', async () => {
      const note = await service.create(owner, {
        kind: 'note',
        title: 'Concept index',
        requestKey: randomUUID(),
        content: plainTextToRichText('A tropical holiday'),
      });

      const signature = indexSignature(
        'test-model\nv1\nConcept index\nA tropical holiday',
      );

      const embedding = Array.from({ length: 1536 }, () => 0.5);
      expect(
        await repository.replaceIndex(owner, note.id, {
          signature,
          model: 'test-model',
          version: 'v1',
          chunks: ['A tropical holiday'],
          embeddings: [embedding],
        }),
      ).toBe(true);
      const indexed = await service.find(owner, note.id);
      expect(indexed.updatedAt).toEqual(note.updatedAt);
      expect(indexed.revision).toBe(note.revision);
      expect(
        (
          await repository.searchVector(
            owner,
            embedding,
            'test-model',
            'v1',
            10,
          )
        ).map((entry) => entry.id),
      ).toEqual([note.id]);
      const changed = await service.update(owner, note.id, {
        revision: indexed.revision,
        content: plainTextToRichText('New content'),
      });

      expect(
        await repository.searchVector(owner, embedding, 'test-model', 'v1', 10),
      ).toEqual([]);
      expect(
        await repository.replaceIndex(owner, note.id, {
          signature,
          model: 'test-model',
          version: 'v1',
          chunks: ['Stale index'],
          embeddings: [embedding],
        }),
      ).toBe(false);
      await service.execute(owner, {
        action: 'trash',
        id: note.id,
        revision: changed.revision,
      });
      expect(
        await repository.searchVector(owner, embedding, 'test-model', 'v1', 10),
      ).toEqual([]);
    });
  },
);
