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
import {
  PrismaNoteWorkRepository,
  PrismaNoteAgentRunRepository,
  PrismaNotePresenceRepository,
  PrismaDailyNoteRepository,
  PrismaUserRepository,
  PrismaWorkspaceRepository,
} from '../../src/database/repositories';
import { NoteMutationService } from '../../src/modules/notes/note-mutation.service';
import { claimNoteAgentTools } from '../../src/modules/conversations/services/note-agent-tools';
import type { NoteAgentClaim } from '../../src/database/interfaces';
import type { AssistantTool } from '../../src/modules/conversations/services/tool-executor.service';
import { NoteAgentCoordinatorService } from '../../src/modules/conversations/services/note-agent-coordinator.service';
import { SkillCatalogService } from '../../src/modules/secretary/skill-catalog.service';
import { createSecretaryTools } from '../../src/modules/secretary/secretary-tools';
import type { LanguageModelGateway } from '../../src/infra/model-gateway';
import { PrismaConversationRepository } from '../../src/database/repositories';
import { EmbeddingsService } from '../../src/infra/embeddings';
import type { QueueService } from '../../src/infra/queue';
import { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';
import { NotesService } from '../../src/modules/notes/notes.service';
import { createNoteQuestionResponseTools } from '../../src/modules/conversations/services/note-question-tools';
import { ContextBuilderService } from '../../src/modules/conversations/services/context-builder.service';

(process.env.NOTES_CONTRACT_ENABLED === 'true' ? describe : describe.skip)(
  'Durable note agent run claims',
  () => {
    const owner = `note-agent-${randomUUID()}`;
    let db: PrismaService;
    let work: PrismaNoteWorkRepository;
    let runs: PrismaNoteAgentRunRepository;
    let messageId: string;
    beforeAll(async () => {
      db = new PrismaService(
        new ConfigService({ BACKEND_DB_URL: process.env.BACKEND_DB_URL }),
      );
      work = new PrismaNoteWorkRepository(db);
      runs = new PrismaNoteAgentRunRepository(db, work);
      await db.user.create({
        data: {
          id: owner,
          name: 'Note agent QA',
          email: `${owner}@test.invalid`,
          timezone: 'Asia/Makassar',
        },
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
            content: 'Pengeluaran hari ini Rp55.000',
            createdAt: new Date('2026-10-31T00:00:00Z'),
          },
        })
      ).id;
    });
    beforeEach(async () => {
      await db.noteWork.deleteMany({ where: { userId: owner } });
      await db.message.deleteMany({
        where: { userId: owner, id: { not: messageId } },
      });
      await db.dailyNote.deleteMany({ where: { userId: owner } });
      await db.noteEditorPresence.deleteMany({ where: { userId: owner } });
      await db.message.update({
        where: { id: messageId },
        data: { content: 'Pengeluaran hari ini Rp55.000' },
      });
      await work.acceptMessage({
        userId: owner,
        sourceMessageId: messageId,
        key: `source:message:${messageId}`,
        stage: 'source',
        payload: {},
      });
    });
    afterAll(async () => {
      await db.user.delete({ where: { id: owner } });
      await db.onModuleDestroy();
    });

    function protectedWriter(): AssistantTool {
      const mutations = new NoteMutationService(
        new PrismaNotePresenceRepository(db),
        work,
      );

      const tool: AssistantTool = {
        definition: {
          name: 'write_daily_note',
          label: 'Write note',
          description: 'Test protected write',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
        parseArguments(value) {
          if (
            !value ||
            typeof value !== 'object' ||
            !('text' in value) ||
            typeof value.text !== 'string'
          )
            throw new Error('Expected note text.');

          return {
            text: value.text,
            ...('date' in value && typeof value.date === 'string'
              ? { date: value.date }
              : {}),
          };
        },
        execute: (input) =>
          mutations
            .execute(
              {
                userId: input.userId,
                sourceMessageId: input.sourceMessageId,
                sourceWork: input.context?.noteSourceWork,
                key: `tool:${input.idempotencyKey}`,
                tool: 'write_daily_note',
                arguments: {
                  ...(input.arguments as { text: string }),
                  date: '2026-10-31',
                },
                destinationRef: 'daily:2026-10-31',
                refs: () => Promise.resolve(['daily:2026-10-31']),
              },
              async () => {
                const note = await db.client.dailyNote.create({
                  data: {
                    userId: input.userId,
                    date: '2026-10-31',
                    timezone: 'Asia/Makassar',
                    sourceType: 'chat',
                    sourceMessageId: input.sourceMessageId,
                    content: { type: 'doc', content: [] },
                    text: 'Rp55.000',
                  },
                });

                return { saved: true, id: note.id };
              },
            )
            .then((result) => (result === null ? { result: null } : result)),
      };

      return tool;
    }

    function claimedWriter(claim: NoteAgentClaim): AssistantTool {
      return claimNoteAgentTools([protectedWriter()], claim, runs)[0]!;
    }

    function coordinator(
      model: LanguageModelGateway,
      mode?: 'apply' | 'proposal',
    ) {
      const skills = new SkillCatalogService();
      const config = new ConfigService({ BACKEND_MODEL_API_KEY: '' });
      const embeddings = new EmbeddingsService(config);
      const queue = {
        dailyNoteIndexes: { add: () => Promise.resolve({ id: 'index' }) },
      } as unknown as QueueService;

      const daily = new DailyNoteService(
        new PrismaDailyNoteRepository(db),
        new PrismaUserRepository(db),
        embeddings,
        queue,
      );

      const notes = new NotesService(
        new PrismaWorkspaceRepository(db),
        embeddings,
        queue,
        daily,
      );

      return new NoteAgentCoordinatorService(
        work,
        runs,
        new PrismaConversationRepository(db),
        [
          ...createSecretaryTools({
            skills: skills.skills,
            context: {} as never,
            availability: {} as never,
            actions: {} as never,
            policy: {} as never,
          }),
          protectedWriter(),
        ],
        model,
        skills,
        new ConfigService({
          BACKEND_NOTE_ORGANIZATION_MODE: mode,
          BACKEND_MEMORY_DREAM_IDLE_MS: 0,
        }),
        notes,
        daily,
      );
    }

    function executeWriter(tool: AssistantTool, text: string, callId: string) {
      return tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: callId,
        arguments: tool.parseArguments({ operationId: 'expense-total', text }),
      });
    }

    test('overlapping workers claim the same source only once', async () => {
      const claims = await Promise.all([
        runs.claim({ userId: owner, idleMs: 0 }),
        runs.claim({ userId: owner, idleMs: 0 }),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(
        await db.noteWork.count({
          where: { userId: owner, status: 'agent_running' },
        }),
      ).toBe(1);
    });

    test('a crash lease can be recovered and the old worker cannot record its result', async () => {
      const first = await runs.claim({ userId: owner, idleMs: 0 });
      if (!first) throw new Error('Initial source claim missing.');
      await db.noteWork.update({
        where: { id: first.source.id },
        data: { nextAttemptAt: new Date('2026-01-01T00:00:00Z') },
      });
      const recovered = await runs.claim({ userId: owner, idleMs: 0 });
      if (!recovered) throw new Error('Crash lease was not recovered.');

      expect(recovered.token).not.toBe(first.token);
      expect(
        await runs.finish(first, {
          status: 'applied',
          value: { text: 'stale worker' },
        }),
      ).toBe('claim_lost');
      expect(
        await runs.finish(recovered, {
          status: 'proposal',
          value: { text: 'Reviewable proposed changes' },
        }),
      ).toBe('recorded');
      expect(await runs.claim({ userId: owner, idleMs: 0 })).toBeNull();
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: first.source.id } }),
      ).toMatchObject({
        status: 'proposal',
        result: { text: 'Reviewable proposed changes' },
        attempts: 1,
      });
    });

    test('changed source evidence invalidates a result planned against the earlier text', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');
      await db.message.update({
        where: { id: messageId },
        data: { content: 'Pengeluaran hari ini Rp65.000' },
      });

      expect(
        await runs.finish(claim, { status: 'applied', value: { saved: true } }),
      ).toBe('stale');
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: claim.source.id } }),
      ).toMatchObject({ status: 'stale' });
    });

    test('an operation alias cannot be reused for different mutation arguments', async () => {
      const presence = new PrismaNotePresenceRepository(db);
      await presence.acquire(owner, 'daily:2026-10-31', 'editor');
      const original = protectedWriter();
      await original.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'original-call',
        arguments: original.parseArguments({ text: 'Rp55.000' }),
      });
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');
      const writer = claimedWriter(claim);
      await executeWriter(writer, 'Rp55.000', 'first-recovery-call');

      await expect(
        executeWriter(writer, 'Rp65.000', 'changed-recovery-call'),
      ).rejects.toThrow('cannot be reused');
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool_alias' },
        }),
      ).toBe(1);
    });

    test('identical mutation arguments from distinct reports retain separate receipts', async () => {
      const first = await runs.claim({ userId: owner, idleMs: 0 });
      if (!first) throw new Error('Initial source claim missing.');
      const payload = {
        tool: 'create_custom_note',
        arguments: { amount: 55000 },
      };

      await runs.withOperation(
        first,
        { key: 'tool:first-report', ...payload },
        async (key) => {
          const operation = await work.spawn(
            first.source,
            key,
            'tool',
            payload,
          );

          return work.apply(operation.id, owner, () =>
            Promise.resolve({ report: 'first' }),
          );
        },
      );
      await runs.finish(first, { status: 'applied', value: { saved: true } });
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const secondMessage = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content: original.content,
          createdAt: new Date('2026-10-31T00:01:00Z'),
        },
      });

      await work.acceptMessage({
        userId: owner,
        sourceMessageId: secondMessage.id,
        key: `source:message:${secondMessage.id}`,
        stage: 'source',
        payload: {},
      });
      const second = await runs.claim({ userId: owner, idleMs: 0 });
      if (!second) throw new Error('Second report source claim missing.');

      const result = await runs.withOperation(
        second,
        { key: 'tool:second-report', ...payload },
        async (key) => {
          const operation = await work.spawn(
            second.source,
            key,
            'tool',
            payload,
          );

          return work.apply(operation.id, owner, () =>
            Promise.resolve({ report: 'second' }),
          );
        },
      );

      expect(result).toEqual({
        status: 'executed',
        value: { report: 'second' },
      });
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool', status: 'applied' },
        }),
      ).toBe(2);
    });

    test('a foreign owner cannot claim another owners source', async () => {
      expect(
        await runs.claim({ userId: 'another-owner', idleMs: 0 }),
      ).toBeNull();
      expect(
        await db.noteWork.count({
          where: { userId: owner, status: 'pending' },
        }),
      ).toBe(1);
    });

    test('an expired worker cannot commit a mutation', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');
      await db.noteWork.update({
        where: { id: claim.source.id },
        data: { nextAttemptAt: new Date('2026-01-01T00:00:00Z') },
      });

      const result = await runs.withClaim(claim, () =>
        work.spawn(claim.source, 'blocked-operation', 'tool', {}),
      );

      expect(result).toEqual({ status: 'claim_lost' });
      expect(await db.noteWork.count({ where: { userId: owner } })).toBe(1);
    });

    test('a changed source prevents the mutation before it executes', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');
      await db.message.update({
        where: { id: messageId },
        data: { content: 'Do not record this expense' },
      });

      const result = await runs.withClaim(claim, () =>
        work.spawn(claim.source, 'blocked-operation', 'tool', {}),
      );

      expect(result).toEqual({ status: 'stale' });
      expect(await db.noteWork.count({ where: { userId: owner } })).toBe(1);
    });

    test('development source selection claims only the selected owner source', async () => {
      const first = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      const message = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const second = await db.message.create({
        data: {
          userId: owner,
          conversationId: message.conversationId,
          role: 'user',
          content: 'Reported measurement 33 cm',
        },
      });

      const selected = await work.acceptMessage({
        userId: owner,
        sourceMessageId: second.id,
        key: `source:message:${second.id}`,
        stage: 'source',
        payload: {},
      });

      expect(
        await runs.claim({
          userId: owner,
          idleMs: 0,
          sourceWorkId: selected.id,
        }),
      ).toMatchObject({ source: { id: selected.id, status: 'agent_running' } });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: first.id } }),
      ).toMatchObject({ status: 'pending' });
    });

    test('development source selection cannot claim a source under another owner', async () => {
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      expect(
        await runs.claim({
          userId: 'foreign-owner',
          idleMs: 0,
          sourceWorkId: source.id,
        }),
      ).toBeNull();
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: source.id } }),
      ).toMatchObject({ status: 'pending' });
    });

    test('a valid claim commits the operation in its guarded transaction', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      const result = await runs.withClaim(claim, async () => {
        const operation = await work.spawn(
          claim.source,
          'valid-operation',
          'tool',
          {},
        );

        return operation.id;
      });

      expect(result.status).toBe('executed');
      expect(
        await db.noteWork.count({ where: { userId: owner, stage: 'tool' } }),
      ).toBe(1);
    });

    test('a failed guarded operation rolls back all of its writes', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      await expect(
        runs.withClaim(claim, async () => {
          await work.spawn(claim.source, 'rolled-back-operation', 'tool', {});
          throw new Error('Mutation failed after its first write');
        }),
      ).rejects.toThrow('Mutation failed after its first write');

      expect(await db.noteWork.count({ where: { userId: owner } })).toBe(1);
    });

    test('lease expiry during a mutation rolls back the operation', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      const result = await runs.withClaim(claim, async () => {
        await work.spawn(claim.source, 'expired-operation', 'tool', {});
        await db.client.noteWork.update({
          where: { id: claim.source.id },
          data: { nextAttemptAt: new Date('2026-01-01T00:00:00Z') },
        });

        return 'must roll back';
      });

      expect(result).toEqual({ status: 'claim_lost' });
      expect(await db.noteWork.count({ where: { userId: owner } })).toBe(1);
    });

    test('a recovered worker reuses the confirmed write despite a different provider call ID', async () => {
      const first = await runs.claim({ userId: owner, idleMs: 0 });
      if (!first) throw new Error('Initial source claim missing.');
      const saved = await executeWriter(
        claimedWriter(first),
        'Rp55.000',
        'first-provider-call',
      );

      await db.noteWork.update({
        where: { id: first.source.id },
        data: { nextAttemptAt: new Date('2026-01-01T00:00:00Z') },
      });
      const recovered = await runs.claim({ userId: owner, idleMs: 0 });
      if (!recovered) throw new Error('Recovery source claim missing.');

      expect(
        await executeWriter(
          claimedWriter(recovered),
          'Rp55.000',
          'new-provider-call',
        ),
      ).toEqual(saved);
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(1);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool', status: 'applied' },
        }),
      ).toBe(1);
    });

    test('reusing a durable operation identity for different arguments is rejected', async () => {
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');
      const writer = claimedWriter(claim);
      await executeWriter(writer, 'Rp55.000', 'first-provider-call');

      await expect(
        executeWriter(writer, 'Rp65.000', 'new-provider-call'),
      ).rejects.toThrow('cannot be reused');
      expect(
        await db.dailyNote.findUniqueOrThrow({
          where: { userId_date: { userId: owner, date: '2026-10-31' } },
        }),
      ).toMatchObject({ text: 'Rp55.000' });
    });

    test('proposal calls persist resulting documents without executing the available writer', async () => {
      const service = coordinator({
        provider: 'openrouter',
        model: 'structured-proposal-boundary',
        generate: async (request) => {
          expect(Object.keys(request.tools!)).not.toContain('write_daily_note');
          const result: unknown = await request.tools!.propose_note_change!
            .execute!(
            {
              proposalId: 'daily-expense-total',
              tool: 'write_daily_note',
              arguments: { text: 'Rp55.000', date: '2026-10-31' },
            },
            { toolCallId: 'propose', messages: [], context: {} },
          );

          expect(JSON.parse(String(result))).toMatchObject({
            status: 'proposal',
            saved: false,
          });

          return {
            text: 'Concrete proposed daily entry.',
            usage: {},
            finishReason: 'stop',
          };
        },
      });

      expect(await service.recover(owner)).toMatchObject({
        mode: 'proposal',
        inspected: 1,
        failed: 0,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'note_proposal' },
        }),
      ).toMatchObject({
        status: 'proposal',
        result: {
          tool: 'write_daily_note',
          destinationRef: 'daily:2026-10-31',
          expectedVersion: null,
          arguments: { text: 'Rp55.000', date: '2026-10-31' },
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Rp55.000' }],
              },
            ],
          },
        },
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
      expect(
        await db.noteWork.count({
          where: { userId: owner, status: 'applied' },
        }),
      ).toBe(0);
    });

    test('background clarification reuses the conversational question instead of posting it again', async () => {
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const question = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'assistant',
          content: 'Rumah atau Kantor?',
        },
      });

      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'reuse-question-boundary',
          generate: async (request) => {
            const content = request.messages[1]!.content;
            if (typeof content !== 'string')
              throw new Error('Expected serialized agent evidence.');
            expect(JSON.parse(content)).toMatchObject({
              conversation: expect.arrayContaining([
                expect.objectContaining({
                  id: question.id,
                  role: 'assistant',
                  content: 'Rumah atau Kantor?',
                }),
              ]),
            });
            await request.tools!.ask_note_question!.execute!(
              {
                question: 'Rumah atau Kantor?',
                existingMessageId: question.id,
              },
              { toolCallId: 'reuse', messages: [], context: {} },
            );
            await request.tools!.ask_note_question!.execute!(
              { question: 'Rumah atau Kantor?' },
              { toolCallId: 'repeat', messages: [], context: {} },
            );

            return {
              text: 'Waiting on the existing question.',
              usage: {},
              finishReason: 'stop',
            };
          },
        },
        'apply',
      );

      await service.recover(owner);
      expect(await service.recover(owner)).toMatchObject({ inspected: 0 });

      expect(
        await db.message.count({ where: { userId: owner, role: 'assistant' } }),
      ).toBe(1);
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'needs_clarification',
        clarificationMessageId: question.id,
        payload: {
          clarificationMessageId: question.id,
          clarificationConversationId: original.conversationId,
        },
      });
    });

    test('question reuse rejects an assistant message from another conversation', async () => {
      const conversation = await db.conversation.create({
        data: { userId: owner },
      });

      const question = await db.message.create({
        data: {
          userId: owner,
          conversationId: conversation.id,
          role: 'assistant',
          content: 'Catatan yang mana?',
        },
      });

      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      await expect(
        runs.askQuestion(claim, 'Catatan yang mana?', question.id),
      ).rejects.toThrow('source conversation');

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: claim.source.id } }),
      ).toMatchObject({ payload: { agentClaimToken: claim.token } });
    });

    test('question reuse rejects modified wording rather than falsely attaching a different question', async () => {
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const question = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'assistant',
          content: 'Rumah atau Kantor?',
        },
      });

      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      await expect(
        runs.askQuestion(claim, 'Transaksi yang mana?', question.id),
      ).rejects.toThrow('exact unanswered assistant question');

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: claim.source.id } }),
      ).toMatchObject({ payload: { agentClaimToken: claim.token } });
    });

    test('an unrelated later message does not force an unanswered question to be published again', async () => {
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const question = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'assistant',
          content: 'Rumah atau Kantor?',
        },
      });

      await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content: 'Apa ibu kota Jepang?',
        },
      });
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      await runs.askQuestion(claim, 'Rumah atau Kantor?', question.id);
      await runs.finish(claim, { status: 'deferred', value: { saved: false } });
      await work.publishQuestions(12, owner);

      expect(
        await db.message.count({ where: { userId: owner, role: 'assistant' } }),
      ).toBe(1);
    });

    test('a question preceding a recorded answer cannot be reused as an unanswered question', async () => {
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const question = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'assistant',
          content: 'Rumah atau Kantor?',
        },
      });

      const first = await runs.claim({ userId: owner, idleMs: 0 });
      if (!first) throw new Error('Source claim missing.');
      await runs.askQuestion(first, 'Rumah atau Kantor?', question.id);
      await runs.finish(first, { status: 'deferred', value: { saved: false } });
      const answer = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content: 'Rumah.',
        },
      });

      await work.resolveQuestion(owner, first.source.id, answer.id, 'resolve');
      const second = await runs.claim({ userId: owner, idleMs: 0 });
      if (!second) throw new Error('Resumed source claim missing.');

      await expect(
        runs.askQuestion(second, 'Rumah atau Kantor?', question.id),
      ).rejects.toThrow('unanswered assistant question');

      expect(
        await db.message.count({ where: { userId: owner, role: 'assistant' } }),
      ).toBe(1);
    });

    test('an agent clarification stays pending and publishes once across repeated recovery', async () => {
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'question-boundary',
          generate: async (request) => {
            const result: unknown = await request.tools!.ask_note_question!
              .execute!(
              {
                question:
                  'Catatan Pengeluaran yang di folder Rumah atau Kantor?',
              },
              { toolCallId: 'question', messages: [], context: {} },
            );

            expect(JSON.parse(String(result))).toMatchObject({
              status: 'needs_clarification',
              saved: false,
            });

            return {
              text: 'Waiting for clarification.',
              usage: {},
              finishReason: 'stop',
            };
          },
        },
        'apply',
      );

      await service.recover(owner);
      expect(await service.recover(owner)).toMatchObject({ inspected: 0 });

      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({ status: 'needs_clarification' });
      expect(
        await db.message.count({
          where: {
            userId: owner,
            role: 'assistant',
            content: 'Catatan Pengeluaran yang di folder Rumah atau Kantor?',
          },
        }),
      ).toBe(1);
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
    });

    test('a current conversational answer resumes the original source with durable clarification evidence', async () => {
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'question-boundary',
          generate: async (request) => {
            await request.tools!.ask_note_question!.execute!(
              { question: 'Rumah atau Kantor?' },
              { toolCallId: 'question', messages: [], context: {} },
            );

            return { text: 'Waiting.', usage: {}, finishReason: 'stop' };
          },
        },
        'apply',
      );

      await service.recover(owner);
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const answer = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content: 'Yang di folder Rumah.',
        },
      });

      const tool = createNoteQuestionResponseTools(work).find(
        (item) => item.definition.name === 'respond_to_note_question',
      );

      if (!tool) throw new Error('Note clarification response tool missing.');

      const user = await db.user.findUniqueOrThrow({ where: { id: owner } });
      const context = await new ContextBuilderService(
        new PrismaConversationRepository(db),
        new ConfigService({}),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        work,
      ).build(user, original.conversationId, answer.id);

      expect(context.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(source.id),
          }),
        ]),
      );
      expect(context.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('respond_to_note_question'),
          }),
        ]),
      );

      expect(
        await tool.execute({
          userId: owner,
          sourceMessageId: answer.id,
          idempotencyKey: 'answer-question',
          arguments: tool.parseArguments({
            workId: source.id,
            action: 'resolve',
          }),
        }),
      ).toMatchObject({ accepted: true, status: 'pending', saved: false });

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: source.id } }),
      ).toMatchObject({
        status: 'pending',
        payload: {
          clarificationAnswer: 'Yang di folder Rumah.',
          answerSourceRef: answer.id,
          question: null,
        },
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
    });

    test('a provider failure after asking retains the question for one-time publication', async () => {
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'question-failure-boundary',
          generate: async (request) => {
            await request.tools!.ask_note_question!.execute!(
              { question: 'Catatan yang mana?' },
              { toolCallId: 'question', messages: [], context: {} },
            );
            throw new Error('Provider unavailable after question receipt');
          },
        },
        'apply',
      );

      expect(await service.recover(owner)).toMatchObject({ failed: 1 });
      expect(await service.recover(owner)).toMatchObject({ inspected: 0 });

      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({ status: 'needs_clarification' });
      expect(
        await db.message.count({
          where: {
            userId: owner,
            role: 'assistant',
            content: 'Catatan yang mana?',
          },
        }),
      ).toBe(1);
    });

    test('an apply run cannot complete a source merely because an unwritten proposal already exists', async () => {
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      const proposal = await work.spawn(
        source,
        'proposal:unwritten',
        'note_proposal',
        { tool: 'create_custom_note' },
      );

      await work.mark(proposal.id, owner, 'proposal');
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'unwritten-proposal-boundary',
          generate: () =>
            Promise.resolve({
              text: 'A proposal exists, so no further action is needed.',
              usage: {},
              finishReason: 'stop',
            }),
        },
        'apply',
      );

      expect(await service.review(owner, 'apply')).toMatchObject({
        deferred: 1,
      });

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: source.id } }),
      ).toMatchObject({
        status: 'deferred',
        result: { pendingWorkIds: [proposal.id] },
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
    });

    test('the coordinator defaults to proposals and retains the source without changing notes', async () => {
      const service = coordinator({
        provider: 'openrouter',
        model: 'proposal-boundary',
        generate: (request) => {
          expect(Object.keys(request.tools!)).not.toContain('write_daily_note');
          const content = request.messages[1]!.content;
          if (typeof content !== 'string')
            throw new Error('Expected serialized source evidence.');
          const evidence = JSON.parse(content) as {
            source: { timezone: string; content: string };
          };

          expect(evidence.source).toMatchObject({
            timezone: 'Asia/Makassar',
            content: 'Pengeluaran hari ini Rp55.000',
          });

          return Promise.resolve({
            text: 'Propose a dated total in an expense tracker.',
            usage: {},
            finishReason: 'stop',
          });
        },
      });

      expect(await service.recover(owner)).toMatchObject({
        mode: 'proposal',
        inspected: 1,
        failed: 0,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'proposal',
        result: { text: 'Propose a dated total in an expense tracker.' },
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
    });

    test('a coordinator apply run loads the skill and writes through the claimed mutation tool', async () => {
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'apply-boundary',
          generate: async (request) => {
            await request.tools!.load_skill!.execute!(
              { name: 'note-capture' },
              { toolCallId: 'load', messages: [], context: {} },
            );
            const result: unknown = await request.tools!.write_daily_note!
              .execute!(
              { operationId: 'expense-total', text: 'Rp55.000' },
              { toolCallId: 'write', messages: [], context: {} },
            );

            expect(JSON.parse(String(result))).toMatchObject({ saved: true });

            return { text: 'Written.', usage: {}, finishReason: 'stop' };
          },
        },
        'apply',
      );

      expect(await service.recover(owner)).toMatchObject({
        mode: 'apply',
        inspected: 1,
        failed: 0,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({ status: 'applied' });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(1);
      expect(await service.recover(owner)).toMatchObject({ inspected: 0 });
    });

    test('a coordinator provider failure records retryable work instead of completion', async () => {
      const service = coordinator({
        provider: 'openrouter',
        model: 'failed-boundary',
        generate: () => Promise.reject(new Error('Provider unavailable')),
      });

      expect(await service.recover(owner)).toMatchObject({
        inspected: 1,
        failed: 1,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'failed',
        attempts: 1,
        lastErrorCode: 'note_agent_failed',
        result: { saved: false },
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
    });

    test('coordinator work waits for an open note and resumes after the last editor closes', async () => {
      const presence = new PrismaNotePresenceRepository(db);
      await presence.acquire(owner, 'daily:2026-10-31', 'editor-one');
      await presence.acquire(owner, 'daily:2026-10-31', 'editor-two');
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'presence-boundary',
          generate: async (request) => {
            await request.tools!.load_skill!.execute!(
              { name: 'note-capture' },
              { toolCallId: 'load', messages: [], context: {} },
            );
            await request.tools!.write_daily_note!.execute!(
              { operationId: 'expense-total', text: 'Rp55.000' },
              { toolCallId: 'write', messages: [], context: {} },
            );

            return { text: 'Run finished.', usage: {}, finishReason: 'stop' };
          },
        },
        'apply',
      );

      expect(await service.recover(owner)).toMatchObject({
        inspected: 1,
        deferred: 1,
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
      await presence.release(owner, 'daily:2026-10-31', 'editor-one');
      expect(await service.review(owner, 'apply')).toMatchObject({
        inspected: 1,
        deferred: 1,
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
      await presence.release(owner, 'daily:2026-10-31', 'editor-two');
      expect(await service.review(owner, 'apply')).toMatchObject({
        inspected: 1,
        deferred: 0,
        failed: 0,
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(1);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool', status: 'applied' },
        }),
      ).toBe(1);
    });

    test('a daily source does not inherit the latest unrelated conversation as instructions', async () => {
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      const message = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      await db.message.create({
        data: {
          userId: owner,
          conversationId: message.conversationId,
          role: 'user',
          content: 'Use the Rumah folder for a different note',
        },
      });

      expect(
        await work.clarificationContext({
          ...source,
          sourceKind: 'daily',
          sourceRef: '2026-10-30',
        }),
      ).toEqual([]);
    });

    test('source conversation evidence excludes later unrelated requests and replies', async () => {
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      const message = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const reply = await db.message.create({
        data: {
          userId: owner,
          conversationId: message.conversationId,
          role: 'assistant',
          content: 'Which note did you mean?',
          createdAt: new Date(source.sourceAt.getTime() + 1000),
        },
      });

      await db.message.createMany({
        data: [
          {
            userId: owner,
            conversationId: message.conversationId,
            role: 'user',
            content: 'An unrelated new task',
            createdAt: new Date(source.sourceAt.getTime() + 2000),
          },
          {
            userId: owner,
            conversationId: message.conversationId,
            role: 'assistant',
            content: 'A response to that new task',
            createdAt: new Date(source.sourceAt.getTime() + 3000),
          },
        ],
      });

      expect(
        (await work.clarificationContext(source)).map((item) => item.id),
      ).toEqual([messageId, reply.id]);
    });

    test('a failed mutation with no child receipt cannot falsely complete its source', async () => {
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'rejected-mutation-boundary',
          generate: async (request) => {
            await expect(
              request.tools!.write_daily_note!.execute!(
                { operationId: 'invalid-write', text: 42 },
                { toolCallId: 'write', messages: [], context: {} },
              ),
            ).rejects.toThrow();

            return {
              text: 'The write could not be completed.',
              usage: {},
              finishReason: 'stop',
            };
          },
        },
        'apply',
      );

      expect(await service.recover(owner)).toMatchObject({
        inspected: 1,
        failed: 1,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'failed',
        attempts: 1,
        lastErrorCode: 'note_agent_failed',
      });
      expect(
        await db.noteWork.count({ where: { userId: owner, stage: 'tool' } }),
      ).toBe(0);
    });

    test('an empty final model result leaves source work failed and recoverable', async () => {
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'empty-result-boundary',
          generate: () =>
            Promise.resolve({
              text: '',
              usage: {},
              finishReason: 'tool-calls',
            }),
        },
        'apply',
      );

      expect(await service.recover(owner)).toMatchObject({
        inspected: 1,
        failed: 1,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'failed',
        lastErrorCode: 'note_agent_failed',
        attempts: 1,
      });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(0);
    });

    test('background recovery reuses an equivalent deferred conversational operation', async () => {
      const presence = new PrismaNotePresenceRepository(db);
      await presence.acquire(owner, 'daily:2026-10-31', 'editor');
      const writer = protectedWriter();
      await writer.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'conversation-call',
        arguments: writer.parseArguments({ text: 'Rp55.000' }),
      });
      const service = coordinator(
        {
          provider: 'openrouter',
          model: 'recover-conversation-boundary',
          generate: async (request) => {
            await request.tools!.load_skill!.execute!(
              { name: 'note-capture' },
              { toolCallId: 'load', messages: [], context: {} },
            );
            await request.tools!.write_daily_note!.execute!(
              { operationId: 'background-retry', text: 'Rp55.000' },
              { toolCallId: 'write', messages: [], context: {} },
            );

            return { text: 'Run finished.', usage: {}, finishReason: 'stop' };
          },
        },
        'apply',
      );

      expect(await service.recover(owner)).toMatchObject({ deferred: 1 });
      expect(
        await db.noteWork.count({ where: { userId: owner, stage: 'tool' } }),
      ).toBe(1);
      await presence.release(owner, 'daily:2026-10-31', 'editor');
      expect(await service.review(owner, 'apply')).toMatchObject({
        deferred: 0,
        failed: 0,
      });
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, key: 'tool:conversation-call' },
        }),
      ).toMatchObject({ status: 'applied' });
      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(1);
    });

    test('recovery reconciles previously duplicated pending operations after one confirmed write', async () => {
      const presence = new PrismaNotePresenceRepository(db);
      await presence.acquire(owner, 'daily:2026-10-31', 'editor');
      const writer = protectedWriter();
      const argumentsValue = writer.parseArguments({ text: 'Rp55.000' });
      await writer.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'old-first-call',
        arguments: argumentsValue,
      });
      await writer.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: 'old-duplicate-call',
        arguments: argumentsValue,
      });
      await presence.release(owner, 'daily:2026-10-31', 'editor');
      const claim = await runs.claim({ userId: owner, idleMs: 0 });
      if (!claim) throw new Error('Source claim missing.');

      await executeWriter(claimedWriter(claim), 'Rp55.000', 'recovery-call');

      expect(await db.dailyNote.count({ where: { userId: owner } })).toBe(1);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool', status: 'applied' },
        }),
      ).toBe(2);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'tool', status: 'deferred' },
        }),
      ).toBe(0);
    });
  },
);
