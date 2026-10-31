import { createDailyNoteTools } from '../../src/modules/conversations/services/daily-note-tools';
import { withNoteSkillInventory } from '../../src/modules/conversations/services/note-skill-inventory';
import { createSecretaryTools } from '../../src/modules/secretary/secretary-tools';
import {
  defaultSkillDirectory,
  loadSkillCatalog,
} from '../../src/modules/secretary/skill-catalog';
import { createNoteProposalResolutionTool } from '../../src/modules/conversations/services/note-proposal-resolution-tool';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { EmbeddingsService } from '../../src/infra/embeddings';
import type { QueueService } from '../../src/infra/queue';
import {
  PrismaDailyNoteRepository,
  PrismaUserRepository,
  PrismaWorkspaceRepository,
  PrismaNoteWorkRepository,
  PrismaNoteAgentRunRepository,
  PrismaNotePresenceRepository,
} from '../../src/database/repositories';
import { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';
import { NotesService } from '../../src/modules/notes/notes.service';
import { NoteMutationService } from '../../src/modules/notes/note-mutation.service';
import { createNotesWorkspaceTools } from '../../src/modules/conversations/services/notes-workspace-tools';
import { protectNoteTools } from '../../src/modules/conversations/services/protected-note-tools';
import { claimNoteAgentTools } from '../../src/modules/conversations/services/note-agent-tools';
import { createNoteProposalTool } from '../../src/modules/conversations/services/note-agent-proposals';
import type { AssistantTool } from '../../src/modules/conversations/services/tool-executor.service';
import type { NoteAgentClaim } from '../../src/database/interfaces';

(process.env.NOTES_CONTRACT_ENABLED === 'true' ? describe : describe.skip)(
  'Replanning protected note operations',
  () => {
    const owner = `note-replan-${randomUUID()}`;
    const foreignOwner = `${owner}-foreign`;
    let db: PrismaService;
    let work: PrismaNoteWorkRepository;
    let runs: PrismaNoteAgentRunRepository;
    let presence: PrismaNotePresenceRepository;
    let notes: NotesService;
    let tools: AssistantTool[];
    let dailyService: DailyNoteService;
    let messageId: string;
    let noteId: string;
    let oldWorkId: string;

    const initial = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '2026-10-31 — Total Rp55.000' }],
        },
      ],
    };

    const correction = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '2026-10-31 — Total Rp65.000' }],
        },
      ],
    };

    const userAddition = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bukti tersimpan', marks: [{ type: 'bold' }] },
      ],
    };

    const revised = {
      type: 'doc',
      content: [...correction.content, userAddition],
    };

    beforeAll(async () => {
      const config = new ConfigService({
        BACKEND_DB_URL: process.env.BACKEND_DB_URL,
        BACKEND_MODEL_API_KEY: '',
      });

      db = new PrismaService(config);
      work = new PrismaNoteWorkRepository(db);
      runs = new PrismaNoteAgentRunRepository(db, work);
      presence = new PrismaNotePresenceRepository(db);
      const queue = {
        dailyNoteIndexes: {
          add: () => Promise.resolve({ id: 'index-boundary' }),
        },
      } as unknown as QueueService;

      const embeddings = new EmbeddingsService(config);
      const daily = new DailyNoteService(
        new PrismaDailyNoteRepository(db),
        new PrismaUserRepository(db),
        embeddings,
        queue,
      );

      dailyService = daily;

      notes = new NotesService(
        new PrismaWorkspaceRepository(db),
        embeddings,
        queue,
        daily,
      );
      tools = protectNoteTools(
        [
          ...createNotesWorkspaceTools(notes),
          ...createDailyNoteTools({ dailyNotes: daily }),
        ],
        {
          mutations: new NoteMutationService(presence, work),
          notes,
          daily,
        },
      );
      await db.user.createMany({
        data: [
          {
            id: owner,
            name: 'Note replanning QA',
            email: `${owner}@test.invalid`,
            timezone: 'Asia/Makassar',
          },
          {
            id: foreignOwner,
            name: 'Foreign replanning QA',
            email: `${foreignOwner}@test.invalid`,
            timezone: 'Asia/Makassar',
          },
        ],
      });
      const conversation = await db.conversation.create({
        data: {
          userId: owner,
          lastMessageAt: new Date('2026-10-01T00:00:00Z'),
        },
      });

      messageId = (
        await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content: 'Koreksi total pengeluaran menjadi Rp65.000',
          },
        })
      ).id;
    });
    beforeEach(async () => {
      await db.noteWork.deleteMany({
        where: { userId: { in: [owner, foreignOwner] } },
      });
      await db.noteEditorPresence.deleteMany({ where: { userId: owner } });
      await db.workspaceItem.deleteMany({ where: { userId: owner } });
      await db.message.update({
        where: { id: messageId },
        data: { content: 'Koreksi total pengeluaran menjadi Rp65.000' },
      });
      await work.acceptMessage({
        userId: owner,
        sourceMessageId: messageId,
        key: `source:message:${messageId}`,
        stage: 'source',
        payload: {},
      });
      noteId = (
        await notes.create(owner, {
          kind: 'note',
          title: 'Pengeluaran',
          requestKey: 'tracker',
          content: initial,
        })
      ).id;
      await presence.acquire(owner, `custom:${noteId}`, 'editor');
      const tool = updateTool(tools);
      await tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'old-call',
        arguments: tool.parseArguments({
          id: noteId,
          revision: 1,
          content: correction,
        }),
      });
      oldWorkId = (
        await db.noteWork.findUniqueOrThrow({
          where: { userId_key: { userId: owner, key: 'tool:old-call' } },
        })
      ).id;
      await notes.update(owner, noteId, {
        revision: 1,
        content: { type: 'doc', content: [...initial.content, userAddition] },
      });
    });
    afterAll(async () => {
      await db.user.deleteMany({
        where: { id: { in: [owner, foreignOwner] } },
      });
      await db.onModuleDestroy();
    });

    function updateTool(registry: AssistantTool[]) {
      const tool = registry.find(
        (item) => item.definition.name === 'update_custom_note',
      );

      if (!tool) throw new Error('Custom note update tool is missing.');

      return tool;
    }

    async function claim(): Promise<NoteAgentClaim> {
      const value = await runs.claim({ userId: owner, idleMs: 0 });
      if (!value) throw new Error('Source claim missing.');

      return value;
    }

    async function replace(
      current: NoteAgentClaim,
      options: {
        revision?: number;
        content?: unknown;
        operationId?: string;
        supersedesWorkIds?: string[];
      } = {},
    ) {
      const tool = updateTool(claimNoteAgentTools(tools, current, runs));

      return tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'provider-replan',
        arguments: tool.parseArguments({
          id: noteId,
          revision: options.revision ?? 2,
          content: options.content ?? revised,
          operationId: options.operationId ?? 'fresh-correction',
          supersedesWorkIds: options.supersedesWorkIds ?? [oldWorkId],
        }),
      });
    }

    function proposalTool(current: NoteAgentClaim) {
      return createNoteProposalTool({
        tools,
        claim: current,
        runs,
        notes,
        daily: dailyService,
      });
    }

    function propose(
      tool: AssistantTool,
      revision = 2,
      proposalId = 'fresh-proposal',
    ) {
      return tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'proposal-call',
        arguments: tool.parseArguments({
          proposalId,
          tool: 'update_custom_note',
          arguments: { id: noteId, revision, content: revised },
        }),
      });
    }

    test('a proposal stores the full resulting rich text and revision while the open note stays unchanged', async () => {
      const before = await notes.find(owner, noteId);
      const tool = proposalTool(await claim());

      expect(await propose(tool)).toMatchObject({
        status: 'proposal',
        saved: false,
      });
      expect(await propose(tool)).toMatchObject({
        status: 'proposal',
        saved: false,
      });

      expect(await notes.find(owner, noteId)).toEqual(before);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toBe(1);
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toMatchObject({
        status: 'proposal',
        result: {
          destinationRef: `custom:${noteId}`,
          expectedVersion: '2',
          document: revised,
          tool: 'update_custom_note',
        },
      });
    });

    async function proposeManagement(arguments_: Record<string, unknown>) {
      const tool = proposalTool(await claim());

      return tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'management-preview',
        arguments: tool.parseArguments({
          proposalId: 'management-preview',
          tool: 'manage_notes_item',
          arguments: arguments_,
        }),
      });
    }

    test('a rename proposal requires the same title as an actual rename', async () => {
      await expect(
        proposeManagement({ action: 'rename', id: noteId, revision: 2 }),
      ).rejects.toThrow('title must be non-empty');
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toBe(0);
    });

    test('a move proposal requires an explicit destination', async () => {
      await expect(
        proposeManagement({ action: 'move', id: noteId, revision: 2 }),
      ).rejects.toThrow('Choose parentId explicitly');
    });

    test('a deletion proposal requires explicit permanent deletion intent', async () => {
      await expect(
        proposeManagement({ action: 'delete', id: noteId, revision: 2 }),
      ).rejects.toThrow('Permanent deletion requires an explicit user request');
    });

    test('an unknown management action cannot become a proposal', async () => {
      await expect(
        proposeManagement({ action: 'archive', id: noteId, revision: 2 }),
      ).rejects.toThrow('Unknown workspace operation');
    });

    test('a restore proposal previews a trashed note without restoring it', async () => {
      const trashed = await notes.execute(owner, {
        action: 'trash',
        id: noteId,
        revision: 2,
      });

      expect(
        await proposeManagement({
          action: 'restore',
          id: noteId,
          revision: trashed.revision,
        }),
      ).toMatchObject({
        saved: false,
        proposal: {
          expectedVersion: String(trashed.revision),
          document: trashed.content,
          effect: {
            action: 'restore',
            writes: [{ id: noteId, trashedAt: null }],
            deletes: [],
          },
        },
      });
      expect(
        await db.workspaceItem.findUniqueOrThrow({ where: { id: noteId } }),
      ).toMatchObject({
        revision: trashed.revision,
        trashedAt: trashed.trashedAt,
      });
    });

    test('a permanent deletion preview reports removed identities instead of a surviving document', async () => {
      const trashed = await notes.execute(owner, {
        action: 'trash',
        id: noteId,
        revision: 2,
      });

      expect(
        await proposeManagement({
          action: 'delete',
          id: noteId,
          revision: trashed.revision,
          permanentDeletionRequested: true,
        }),
      ).toMatchObject({
        saved: false,
        proposal: {
          document: null,
          effect: { action: 'delete', writes: [], deletes: [noteId] },
        },
      });
      expect(await db.workspaceItem.count({ where: { id: noteId } })).toBe(1);
    });

    test('a proposal rejects a title collision under the same workspace rules as writing', async () => {
      await notes.create(owner, {
        kind: 'note',
        title: 'Already here',
        requestKey: 'collision',
      });
      await expect(
        proposeManagement({
          action: 'rename',
          id: noteId,
          revision: 2,
          title: 'Already here',
        }),
      ).rejects.toMatchObject({
        response: { error: { details: { reason: 'NAME_COLLISION' } } },
      });
    });

    test('a folder move proposal rejects moving a parent into its own subtree', async () => {
      const parent = await notes.create(owner, {
        kind: 'folder',
        title: 'Parent',
        requestKey: 'parent',
      });

      const child = await notes.create(owner, {
        kind: 'folder',
        title: 'Child',
        parentId: parent.id,
        requestKey: 'child',
      });

      await expect(
        proposeManagement({
          action: 'move',
          id: parent.id,
          revision: parent.revision,
          parentId: child.id,
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            message:
              'Folder tidak dapat dipindahkan ke dirinya atau subfoldernya.',
          },
        },
      });
      expect(
        await db.workspaceItem.findUniqueOrThrow({ where: { id: parent.id } }),
      ).toMatchObject({ parentId: null, revision: 1 });
    });

    test('a folder creation proposal validates names before persisting a preview', async () => {
      await expect(
        proposeManagement({ action: 'create_folder', title: 'Invalid/name' }),
      ).rejects.toMatchObject({
        response: {
          error: {
            message: 'Nama harus berisi 1–240 karakter tanpa garis miring.',
          },
        },
      });
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toBe(0);
    });

    async function pendingProposal(current: NoteAgentClaim) {
      await propose(proposalTool(current));

      return db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'note_proposal' },
      });
    }

    async function resolvePreview(
      current: NoteAgentClaim,
      resolution: Record<string, unknown>,
    ) {
      const tool = createNoteProposalResolutionTool(current, runs);

      return tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'resolution',
        arguments: tool.parseArguments(resolution),
      });
    }

    test('apply recovery reclaims an incorrectly completed source with an unresolved preview', async () => {
      const current = await claim();
      await pendingProposal(current);
      await db.noteWork.update({
        where: { id: current.source.id },
        data: {
          status: 'applied',
          nextAttemptAt: new Date('2026-01-01T00:00:00Z'),
        },
      });

      expect(
        await runs.claim({ userId: owner, idleMs: 0, includeProposals: true }),
      ).toMatchObject({
        source: { id: current.source.id, status: 'agent_running' },
      });
    });

    test('apply recovery reclaims an incorrectly completed run with no final model result', async () => {
      const current = await claim();
      await db.noteWork.update({
        where: { id: current.source.id },
        data: {
          status: 'applied',
          result: { text: '' },
          nextAttemptAt: new Date('2026-01-01T00:00:00Z'),
        },
      });

      expect(
        await runs.claim({ userId: owner, idleMs: 0, includeProposals: true }),
      ).toMatchObject({
        source: { id: current.source.id, status: 'agent_running' },
      });
    });

    test('proposal fulfillment requires a confirmed write rather than a preview or pending operation', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);

      await expect(
        resolvePreview(current, {
          workId: preview.id,
          action: 'fulfilled',
          reason: 'Captured',
          receiptWorkId: oldWorkId,
        }),
      ).rejects.toThrow('requires a confirmed write receipt');
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: preview.id } }),
      ).toMatchObject({ status: 'proposal' });
    });

    test('proposal fulfillment records a confirmed matching write and replays without changing the note', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await replace(current);
      const receipt = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'tool', status: 'applied' },
      });

      const before = await notes.find(owner, noteId);
      const resolution = {
        workId: preview.id,
        action: 'fulfilled',
        reason: 'Confirmed exact change',
        receiptWorkId: receipt.id,
      };

      expect(await resolvePreview(current, resolution)).toMatchObject({
        status: 'applied',
        saved: false,
      });
      expect(await resolvePreview(current, resolution)).toMatchObject({
        status: 'applied',
        saved: false,
      });
      expect(await notes.find(owner, noteId)).toEqual(before);
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: preview.id } }),
      ).toMatchObject({
        result: preview.result,
        payload: {
          resolution: {
            action: resolution.action,
            reason: resolution.reason,
            receiptWorkId: receipt.id,
          },
        },
      });
    });

    test('a proposal can resolve using the operation identity known to the current agent run', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await replace(current, { operationId: 'known-write' });

      expect(
        await resolvePreview(current, {
          workId: preview.id,
          action: 'fulfilled',
          reason: 'Confirmed change',
          receiptOperationId: 'known-write',
        }),
      ).toMatchObject({ status: 'applied', saved: false });
    });

    test('a changed source version prevents retiring its old proposal', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);
      await db.noteWork.update({
        where: { id: preview.id },
        data: { sourceVersion: 'old-version' },
      });

      await expect(
        resolvePreview(current, {
          workId: preview.id,
          action: 'dismissed',
          reason: 'No change',
        }),
      ).rejects.toThrow('same owner and source evidence');
    });

    test('a different confirmed edit cannot falsely fulfill a proposal', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await replace(current, { content: initial });
      const receipt = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'tool', status: 'applied' },
      });

      await expect(
        resolvePreview(current, {
          workId: preview.id,
          action: 'fulfilled',
          reason: 'Changed plan',
          receiptWorkId: receipt.id,
        }),
      ).rejects.toThrow('Fulfillment requires the proposed tool and arguments');
      expect(
        await resolvePreview(current, {
          workId: preview.id,
          action: 'superseded',
          reason: 'Fresh plan replaces preview',
          receiptWorkId: receipt.id,
        }),
      ).toMatchObject({ status: 'rejected', saved: false });
    });

    test('dismissing an obsolete preview preserves notes and the original proposed document', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);
      const before = await notes.find(owner, noteId);

      expect(
        await resolvePreview(current, {
          workId: preview.id,
          action: 'dismissed',
          reason: 'No longer useful after inspection',
        }),
      ).toMatchObject({ status: 'rejected', saved: false });
      expect(await notes.find(owner, noteId)).toEqual(before);
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: preview.id } }),
      ).toMatchObject({
        result: preview.result,
        lastErrorCode: 'proposal_dismissed',
      });
      await expect(
        resolvePreview(current, {
          workId: preview.id,
          action: 'dismissed',
          reason: 'Different outcome',
        }),
      ).rejects.toThrow('cannot be reopened');
    });

    test('a proposal resolution cannot retire another owners preview', async () => {
      const current = await claim();
      const preview = await pendingProposal(current);
      await db.noteWork.update({
        where: { id: preview.id },
        data: { userId: foreignOwner },
      });

      await expect(
        resolvePreview(current, {
          workId: preview.id,
          action: 'dismissed',
          reason: 'No change',
        }),
      ).rejects.toThrow('same owner and source evidence');
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: preview.id } }),
      ).toMatchObject({ status: 'proposal' });
    });

    test('loading note guidance supplies current owner paths and revisions without changing product notes', async () => {
      await notes.create(foreignOwner, {
        kind: 'note',
        title: 'Foreign private tracker',
        requestKey: 'private-inventory',
      });
      const registry = withNoteSkillInventory(
        createSecretaryTools({
          skills: loadSkillCatalog(defaultSkillDirectory()),
          context: {} as never,
          availability: {} as never,
          actions: {} as never,
          policy: {} as never,
        }),
        notes,
      );

      const loader = registry.find(
        (tool) => tool.definition.name === 'load_skill',
      );

      if (!loader) throw new Error('Skill loader missing');
      const before = await notes.find(owner, noteId);

      const result = await loader.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'load-inventory',
        arguments: loader.parseArguments({ name: 'note-capture' }),
      });

      expect(result).toMatchObject({
        skill: 'note-capture',
        workspace: {
          total: 1,
          truncated: false,
          items: [
            {
              id: noteId,
              title: 'Pengeluaran',
              path: 'Pengeluaran',
              revision: 2,
              kind: 'note',
            },
          ],
        },
      });
      expect(JSON.stringify(result)).not.toContain('Foreign private tracker');
      expect(await notes.find(owner, noteId)).toEqual(before);
    });

    async function dailyProposal(arguments_: Record<string, unknown>) {
      const current = await claim();
      const tool = proposalTool(current);

      return tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'daily-preview',
        arguments: tool.parseArguments({
          proposalId: 'daily-preview',
          tool: 'write_daily_note',
          arguments: arguments_,
        }),
      });
    }

    test('daily proposals cannot describe an empty rich-text document as a saved record', async () => {
      await expect(
        dailyProposal({
          date: '2026-10-27',
          text: 'Rp55.000',
          document: { type: 'doc', content: [] },
        }),
      ).rejects.toThrow('valid non-empty Tiptap document');
      expect(
        await db.dailyNote.count({
          where: { userId: owner, date: '2026-10-27' },
        }),
      ).toBe(0);
    });

    test('daily proposals and actual writes preserve the same rich text and source date', async () => {
      const document = {
        type: 'doc',
        content: [
          userAddition,
          {
            type: 'paragraph',
            content: [
              {
                type: 'noteLink',
                attrs: { target: `custom:${noteId}`, label: 'Pengeluaran' },
              },
            ],
          },
        ],
      };

      const args = {
        date: '2026-10-26',
        text: 'Bukti tersimpan',
        document,
        expectedUpdatedAt: null,
      };

      expect(await dailyProposal(args)).toMatchObject({
        saved: false,
        proposal: {
          destinationRef: 'daily:2026-10-26',
          expectedVersion: null,
          document,
        },
      });
      expect(await dailyService.findByDate(owner, '2026-10-26')).toBeNull();
      const tool = createDailyNoteTools({ dailyNotes: dailyService }).find(
        (x) => x.definition.name === 'write_daily_note',
      );

      if (!tool) throw new Error('Daily writer missing');
      await tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'daily-apply-parity',
        arguments: tool.parseArguments(args),
      });
      expect(await dailyService.findByDate(owner, '2026-10-26')).toMatchObject({
        content: document,
      });
    });

    test('a malformed nested rich-text edit cannot change a note or advance its revision', async () => {
      const before = await notes.find(owner, noteId);
      const malformed = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ text: 'Bukti tersimpan', marks: [{ type: 'bold' }] }],
          },
        ],
      };

      await expect(
        Promise.resolve().then(() =>
          notes.update(owner, noteId, { revision: 2, content: malformed }),
        ),
      ).rejects.toMatchObject({
        response: { error: { message: 'Isi catatan tidak valid.' } },
      });
      expect(await notes.find(owner, noteId)).toEqual(before);
    });

    test('a stale proposal is rejected instead of storing an obsolete document revision', async () => {
      await expect(propose(proposalTool(await claim()), 1)).rejects.toThrow(
        'current owner note revision',
      );

      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toBe(0);
      expect(await notes.find(owner, noteId)).toMatchObject({ revision: 2 });
    });

    test('a failed provider can leave an independently durable proposal available for recovery', async () => {
      const current = await claim();
      await propose(proposalTool(current));
      await runs.finish(current, {
        status: 'failed',
        value: { saved: false },
        errorCode: 'provider_failure',
      });
      const restarted = new PrismaNoteAgentRunRepository(
        db,
        new PrismaNoteWorkRepository(db),
      );

      await work.expedite(owner);

      const next = await restarted.claim({ userId: owner, idleMs: 0 });
      expect(next?.source.status).toBe('agent_running');
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toMatchObject({ status: 'proposal', result: { document: revised } });
      expect(await notes.find(owner, noteId)).toMatchObject({ revision: 2 });
    });

    test('an expired worker cannot persist a proposal', async () => {
      const current = await claim();
      await db.noteWork.update({
        where: { id: current.source.id },
        data: { nextAttemptAt: new Date('2026-01-01T00:00:00Z') },
      });

      await expect(propose(proposalTool(current))).rejects.toThrow(
        'claim_lost',
      );

      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toBe(0);
    });

    test('a proposal identity cannot replace an earlier document with different arguments', async () => {
      const tool = proposalTool(await claim());
      await propose(tool);

      await expect(
        tool.execute({
          userId: owner,
          sourceMessageId: messageId,
          idempotencyKey: 'changed-proposal',
          arguments: tool.parseArguments({
            proposalId: 'fresh-proposal',
            tool: 'update_custom_note',
            arguments: { id: noteId, revision: 2, content: initial },
          }),
        }),
      ).rejects.toThrow('different evidence or changes');

      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toMatchObject({ result: { document: revised } });
    });

    test('changed source evidence prevents proposal persistence', async () => {
      const current = await claim();
      await db.message.update({
        where: { id: messageId },
        data: { content: 'Jangan catat koreksi ini' },
      });

      await expect(propose(proposalTool(current))).rejects.toThrow('stale');

      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toBe(0);
    });

    test('a foreign owner cannot submit a proposal under another owners claim', async () => {
      const tool = proposalTool(await claim());

      await expect(
        tool.execute({
          userId: foreignOwner,
          sourceMessageId: messageId,
          idempotencyKey: 'foreign-proposal',
          arguments: tool.parseArguments({
            proposalId: 'foreign',
            tool: 'update_custom_note',
            arguments: { id: noteId, revision: 2, content: revised },
          }),
        }),
      ).rejects.toThrow('source owner');

      expect(
        await db.noteWork.count({
          where: {
            userId: { in: [owner, foreignOwner] },
            stage: 'note_proposal',
          },
        }),
      ).toBe(0);
    });

    test('new note proposals retain rich-text marks and link identities', async () => {
      const tool = proposalTool(await claim());
      const document = {
        type: 'doc',
        content: [
          userAddition,
          {
            type: 'paragraph',
            content: [
              {
                type: 'noteLink',
                attrs: { target: `custom:${noteId}`, label: 'Pengeluaran' },
              },
            ],
          },
        ],
      };

      await tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'create-proposal',
        arguments: tool.parseArguments({
          proposalId: 'rich-new-note',
          tool: 'create_custom_note',
          arguments: { title: 'Referensi', content: document },
        }),
      });

      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toMatchObject({
        result: {
          document,
          arguments: { title: 'Referensi', content: document },
        },
      });
      expect(await db.workspaceItem.count({ where: { userId: owner } })).toBe(
        1,
      );
    });

    test('creating a note preserves the supplied rich-text document rather than storing an empty note', async () => {
      const tool = tools.find(
        (candidate) => candidate.definition.name === 'create_custom_note',
      );

      if (!tool) throw new Error('Create custom note tool missing.');
      const document = {
        type: 'doc',
        content: [
          userAddition,
          {
            type: 'paragraph',
            content: [
              {
                type: 'noteLink',
                attrs: { target: `custom:${noteId}`, label: 'Pengeluaran' },
              },
            ],
          },
        ],
      };

      await tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'rich-creation',
        arguments: tool.parseArguments({
          title: 'Referensi',
          content: document,
        }),
      });

      expect(
        await db.workspaceItem.findFirstOrThrow({
          where: { userId: owner, title: 'Referensi' },
        }),
      ).toMatchObject({ content: document, revision: 1 });
    });

    test('a fresh edit preserves manual changes and retires the obsolete operation after commit', async () => {
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await replace(await claim());

      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'rejected', lastErrorCode: 'superseded' });
    });

    test('a blocked replacement leaves the obsolete operation unfinished until the replacement commits', async () => {
      const current = await claim();
      expect(await replace(current)).toMatchObject({
        status: 'deferred',
        saved: false,
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'deferred' });
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await replace(current);

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'rejected', lastErrorCode: 'superseded' });
      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
    });

    test('a failed replacement rolls back its retirement plan and preserves unfinished work', async () => {
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await expect(replace(await claim(), { revision: 1 })).rejects.toThrow();

      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 2,
        content: { type: 'doc', content: [...initial.content, userAddition] },
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'deferred' });
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool_replan' },
        }),
      ).toBe(0);
    });

    test('replanning a replacement retires its unfinished ancestors after the newest write commits', async () => {
      const current = await claim();
      await replace(current);
      const first = await db.noteWork.findUniqueOrThrow({
        where: {
          userId_key: {
            userId: owner,
            key: `tool:note-agent:${current.source.id}:fresh-correction`,
          },
        },
      });

      const extra = {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Tambahan manual kedua',
            marks: [{ type: 'italic' }],
          },
        ],
      };

      await notes.update(owner, noteId, {
        revision: 2,
        content: {
          type: 'doc',
          content: [...initial.content, userAddition, extra],
        },
      });
      await presence.release(owner, `custom:${noteId}`, 'editor');

      await replace(current, {
        revision: 3,
        content: { type: 'doc', content: [...revised.content, extra] },
        operationId: 'second-replan',
        supersedesWorkIds: [first.id],
      });

      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 4,
        content: { type: 'doc', content: [...revised.content, extra] },
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'rejected', lastErrorCode: 'superseded' });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: first.id } }),
      ).toMatchObject({ status: 'rejected', lastErrorCode: 'superseded' });
      expect(
        await db.noteWork.count({
          where: {
            userId: owner,
            stage: 'tool',
            status: { in: ['pending', 'failed', 'deferred'] },
          },
        }),
      ).toBe(0);
    });

    test('an equivalent retry with a different identity completes the existing replacement plan', async () => {
      const current = await claim();
      await replace(current);
      await presence.release(owner, `custom:${noteId}`, 'editor');

      await replace(current, { operationId: 'renamed-retry' });

      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool_replan', status: 'pending' },
        }),
      ).toBe(0);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool_replan', status: 'applied' },
        }),
      ).toBe(2);
      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
    });

    test('an equivalent retry can resume persisted replacement dependencies without declaring a new plan', async () => {
      const current = await claim();
      await replace(current);
      await presence.release(owner, `custom:${noteId}`, 'editor');
      const tool = updateTool(claimNoteAgentTools(tools, current, runs));

      await tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'provider-resume',
        arguments: tool.parseArguments({
          id: noteId,
          revision: 2,
          content: revised,
          operationId: 'equivalent-retry',
        }),
      });

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'rejected', lastErrorCode: 'superseded' });
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool_replan', status: 'pending' },
        }),
      ).toBe(0);
      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
    });

    test('an identical deferred mutation with a redundant replacement reference resumes once after editor release', async () => {
      const original = updateTool(tools);
      await original.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'current-version',
        arguments: original.parseArguments({
          id: noteId,
          revision: 2,
          content: revised,
        }),
      });
      const pending = await db.noteWork.findUniqueOrThrow({
        where: { userId_key: { userId: owner, key: 'tool:current-version' } },
      });

      const current = await claim();
      const tool = updateTool(claimNoteAgentTools(tools, current, runs));
      const input = {
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'provider-retry',
        arguments: tool.parseArguments({
          id: noteId,
          revision: 2,
          content: revised,
          operationId: 'same-change',
          supersedesWorkIds: [pending.id],
        }),
      };

      await tool.execute(input);
      expect(await notes.find(owner, noteId)).toMatchObject({ revision: 2 });
      const alias = await db.noteWork.findUniqueOrThrow({
        where: {
          userId_key: {
            userId: owner,
            key: `tool:note-agent:${current.source.id}:same-change`,
          },
        },
      });

      const aliasRetry = {
        ...input,
        arguments: tool.parseArguments({
          id: noteId,
          revision: 2,
          content: revised,
          operationId: 'same-change',
          supersedesWorkIds: [pending.id, alias.id],
        }),
      };

      await presence.release(owner, `custom:${noteId}`, 'editor');
      await tool.execute(aliasRetry);
      await tool.execute(aliasRetry);
      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'applied' });
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool_replan' },
        }),
      ).toBe(0);
    });

    test('confirmed mutations cannot be retired as unfinished work', async () => {
      await presence.release(owner, `custom:${noteId}`, 'editor');
      const current = await claim();
      await replace(current);
      const confirmed = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'tool', status: 'applied' },
      });

      await expect(
        replace(current, {
          revision: 3,
          operationId: 'invalid-confirmed-replacement',
          supersedesWorkIds: [confirmed.id],
        }),
      ).rejects.toThrow('unfinished');

      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: confirmed.id } }),
      ).toMatchObject({ status: 'applied' });
    });

    test('replacement cannot retire another owners operation even with matching source metadata', async () => {
      const current = await claim();
      const foreign = await db.noteWork.create({
        data: {
          userId: foreignOwner,
          key: 'tool:foreign',
          stage: 'tool',
          sourceKind: current.source.sourceKind,
          sourceRef: current.source.sourceRef,
          sourceVersion: current.source.sourceVersion,
          sourceAt: current.source.sourceAt,
          timezone: current.source.timezone,
          sourceContent: 'Foreign evidence',
          payload: {},
        },
      });

      await presence.release(owner, `custom:${noteId}`, 'editor');

      await expect(
        replace(current, { supersedesWorkIds: [foreign.id] }),
      ).rejects.toThrow('same owner and source');

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: foreign.id } }),
      ).toMatchObject({ status: 'pending' });
      expect(await notes.find(owner, noteId)).toMatchObject({ revision: 2 });
    });

    test('replacement references remain immutable across retries', async () => {
      const current = await claim();
      await replace(current);

      await expect(
        replace(current, { supersedesWorkIds: ['different-work'] }),
      ).rejects.toThrow('different superseded operations');

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'deferred' });
      expect(await notes.find(owner, noteId)).toMatchObject({ revision: 2 });
    });

    test.each(['rejected', 'stale', 'needs_clarification'])(
      'failure and deferral do not reopen %s work',
      async (status) => {
        await db.noteWork.update({
          where: { id: oldWorkId },
          data: { status, lastErrorCode: 'protected-state' },
        });

        await work.fail(oldWorkId, owner, 'unexpected-retry');
        await work.defer(oldWorkId, owner, 'unexpected-deferral');

        expect(
          await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
        ).toMatchObject({
          status,
          lastErrorCode: 'protected-state',
          attempts: 0,
        });
      },
    );

    test('a new provider identity cannot replay a superseded stale mutation', async () => {
      await presence.release(owner, `custom:${noteId}`, 'editor');
      const current = await claim();
      await replace(current);
      const tool = updateTool(claimNoteAgentTools(tools, current, runs));

      await expect(
        tool.execute({
          userId: owner,
          sourceMessageId: messageId,
          idempotencyKey: 'stale-provider-retry',
          arguments: tool.parseArguments({
            id: noteId,
            revision: 1,
            content: correction,
            operationId: 'retry-superseded-payload',
          }),
        }),
      ).rejects.toThrow('retired');

      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool', status: 'failed' },
        }),
      ).toBe(0);
      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
    });

    test('retrying a retired operation cannot reactivate it through failure bookkeeping', async () => {
      await presence.release(owner, `custom:${noteId}`, 'editor');
      await replace(await claim());
      const tool = updateTool(tools);
      await expect(
        tool.execute({
          userId: owner,
          sourceMessageId: messageId,
          idempotencyKey: 'old-call',
          arguments: tool.parseArguments({
            id: noteId,
            revision: 1,
            content: correction,
          }),
        }),
      ).rejects.toThrow('no longer applicable');

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: oldWorkId } }),
      ).toMatchObject({ status: 'rejected', lastErrorCode: 'superseded' });
      expect(await notes.find(owner, noteId)).toMatchObject({
        revision: 3,
        content: revised,
      });
    });
  },
);
