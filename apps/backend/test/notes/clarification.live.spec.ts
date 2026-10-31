import { randomUUID } from 'node:crypto';
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  test,
  expect,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { EmbeddingsService } from '../../src/infra/embeddings';
import type { QueueService } from '../../src/infra/queue';
import type { LanguageModelGateway } from '../../src/infra/model-gateway';
import type { NoteWork, NoteWorkPayload } from '../../src/database/entities';
import {
  PrismaNoteWorkRepository,
  PrismaNotePresenceRepository,
  PrismaDailyNoteRepository,
  PrismaUserRepository,
  PrismaWorkspaceRepository,
} from '../../src/database/repositories';
import { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';
import { NotesService } from '../../src/modules/notes/notes.service';
import { NoteOrganizationService } from '../../src/modules/notes/note-organization.service';
import { NoteClarificationService } from '../../src/modules/notes/note-clarification.service';

const enabled = process.env.NOTES_CONTRACT_ENABLED === 'true';
const question = 'Catatan Pengeluaran yang mana: Rumah atau Kerja?';
(enabled ? describe : describe.skip)(
  'Durable clarification delivery and resolution',
  () => {
    const owner = `clarification-${randomUUID()}`;
    let db: PrismaService,
      work: PrismaNoteWorkRepository,
      presence: PrismaNotePresenceRepository,
      notes: NotesService,
      daily: DailyNoteService;

    let conversationId: string, messageId: string, pending: NoteWork;
    beforeAll(async () => {
      const config = new ConfigService({
        BACKEND_DB_URL: process.env.BACKEND_DB_URL,
        BACKEND_MODEL_API_KEY: '',
      });

      db = new PrismaService(config);
      await db.user.create({
        data: {
          id: owner,
          name: 'Clarification contract',
          email: `${owner}@test.invalid`,
          timezone: 'Asia/Makassar',
        },
      });
      const queue = {
        dailyNoteIndexes: { add: () => Promise.resolve({ id: 'index-test' }) },
      } as unknown as QueueService;

      daily = new DailyNoteService(
        new PrismaDailyNoteRepository(db),
        new PrismaUserRepository(db),
        new EmbeddingsService(config),
        queue,
      );
      notes = new NotesService(
        new PrismaWorkspaceRepository(db),
        new EmbeddingsService(config),
        queue,
        daily,
      );
      work = new PrismaNoteWorkRepository(db);
      presence = new PrismaNotePresenceRepository(db);
    });
    beforeEach(async () => {
      await db.noteWork.deleteMany({ where: { userId: owner } });
      await db.conversation.deleteMany({ where: { userId: owner } });
      await db.noteEditorPresence.deleteMany({ where: { userId: owner } });
      await db.workspaceItem.deleteMany({ where: { userId: owner } });
      const conversation = await db.conversation.create({
        data: { userId: owner },
      });

      conversationId = conversation.id;
      messageId = (
        await db.message.create({
          data: {
            userId: owner,
            conversationId,
            role: 'user',
            content: 'Catat pengeluaran hari ini Rp55.000',
          },
        })
      ).id;
      const source = await work.acceptMessage({
        userId: owner,
        sourceMessageId: messageId,
        key: `source:message:${messageId}`,
        stage: 'source',
        payload: {},
      });

      pending = await work.spawn(source, 'ambiguous-expense', 'capture', {
        quote: 'pengeluaran hari ini Rp55.000',
        purpose: 'tracking',
        operation: 'total',
        topic: 'Pengeluaran',
        text: 'Total pengeluaran Rp55.000',
        date: '2026-10-31',
        explicitRef: null,
        explicitOnly: true,
        organize: false,
        question,
        dailyRef: 'daily:2026-10-31',
      });
      await work.mark(pending.id, owner, 'needs_clarification');
      await work.mark(source.id, owner, 'planned', {
        items: [pending.payload],
      });
    });
    afterAll(async () => {
      await db.user.delete({ where: { id: owner } });
      await db.onModuleDestroy();
    });

    function answer(content = 'Di catatan Rumah') {
      return db.message.create({
        data: { userId: owner, conversationId, role: 'user', content },
      });
    }

    test('repeated background passes publish a question exactly once', async () => {
      await work.publishQuestions(12, owner);
      await work.publishQuestions(12, owner);
      expect(
        await db.message.count({
          where: {
            userId: owner,
            conversationId,
            role: 'assistant',
            content: question,
          },
        }),
      ).toBe(1);
    });
    test('a new ambiguity after an answer is delivered once as a separate question', async () => {
      await work.publishQuestions(12, owner);
      const response = await answer();
      await work.resolveQuestion(owner, pending.id, response.id, 'resolve');
      const resolved = await db.noteWork.findUniqueOrThrow({
        where: { id: pending.id },
      });

      const payload = resolved.payload as NoteWorkPayload;
      const nextQuestion = 'Transaksi makan atau total harian yang dikoreksi?';

      await work.mark(pending.id, owner, 'needs_clarification', {
        ...payload,
        question: nextQuestion,
      });
      await work.publishQuestions(12, owner);
      await work.publishQuestions(12, owner);

      expect(
        await db.message.count({
          where: { userId: owner, role: 'assistant', content: nextQuestion },
        }),
      ).toBe(1);
      expect(
        await db.message.count({
          where: { userId: owner, role: 'assistant', content: question },
        }),
      ).toBe(1);
    });

    test('concurrent publishers commit one question and its receipt', async () => {
      await Promise.all([
        work.publishQuestions(12, owner),
        work.publishQuestions(12, owner),
      ]);
      expect(
        await db.message.count({
          where: {
            userId: owner,
            conversationId,
            role: 'assistant',
            content: question,
          },
        }),
      ).toBe(1);
    });
    test('a removed source cannot produce a question', async () => {
      await db.message.delete({ where: { id: messageId } });
      expect(await work.publishQuestions(12, owner)).toBe(0);
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'stale' });
    });

    test('background recovery surfaces an unanswered question without repeatedly asking it', async () => {
      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'no-extra-model-work',
        generate: () =>
          Promise.reject(
            new Error('No model work is needed to deliver a stored question.'),
          ),
      };

      const organizer = new NoteOrganizationService(
        work,
        presence,
        model,
        notes,
        daily,
        new ConfigService({
          BACKEND_NOTE_ORGANIZATION_MODE: 'apply',
          BACKEND_MEMORY_DREAM_IDLE_MS: 0,
        }),
      );

      await organizer.recover(owner);
      await organizer.recover(owner);
      expect(
        await db.message.count({
          where: {
            userId: owner,
            conversationId,
            role: 'assistant',
            content: question,
          },
        }),
      ).toBe(1);
      expect((await notes.list(owner)).items).toEqual([]);
    });

    test('an answer from another conversation cannot resolve the question', async () => {
      await work.publishQuestions(12, owner);
      const other = await db.conversation.create({ data: { userId: owner } });
      const foreign = await db.message.create({
        data: {
          userId: owner,
          conversationId: other.id,
          role: 'user',
          content: 'Di Rumah',
        },
      });

      await expect(
        work.resolveQuestion(owner, pending.id, foreign.id, 'resolve'),
      ).rejects.toThrow('outside');
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'needs_clarification' });
    });
    test('rejecting pending work does not mutate notes or ask again', async () => {
      await work.publishQuestions(12, owner);
      const rejection = await answer('Jangan simpan catatan ini');
      expect(
        await work.resolveQuestion(owner, pending.id, rejection.id, 'reject'),
      ).toBe(true);
      expect(await work.publishQuestions(12, owner)).toBe(0);
      expect((await notes.list(owner)).items).toEqual([]);
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'rejected' });
    });
    test('removing an answer invalidates a pending resolved write', async () => {
      await work.publishQuestions(12, owner);
      const response = await answer();
      await work.resolveQuestion(
        owner,
        pending.id,
        response.id,
        'resolve',
        'daily:2026-10-31',
      );
      await db.message.delete({ where: { id: response.id } });
      const resolved = await db.noteWork.findUniqueOrThrow({
        where: { id: pending.id },
      });

      expect(await work.sourceValid(resolved)).toBe(false);
    });

    test('an unrelated message leaves the clarification unanswered', async () => {
      await work.publishQuestions(12, owner);
      const response = await answer('Apa jadwal saya besok?');
      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'unrelated-answer-fixture',
        generate: () =>
          Promise.resolve({
            text: JSON.stringify({
              remainingRecords: false,
              resolutions: [],
            }),
            usage: {},
          }),
      };

      const resolver = new NoteClarificationService(work, model, notes);
      expect(await resolver.resolve(owner, response.id)).toEqual({
        resolved: [],
        remainingRecords: false,
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'needs_clarification' });
    });

    test('a fabricated destination is rejected before the pending work changes', async () => {
      await work.publishQuestions(12, owner);
      const response = await answer();
      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'invalid-destination-fixture',
        generate: () =>
          Promise.resolve({
            text: JSON.stringify({
              remainingRecords: false,
              resolutions: [
                {
                  workId: pending.id,
                  action: 'resolve',
                  quote: 'Di catatan Rumah',
                  destinationRef: 'custom:unknown',
                },
              ],
            }),
            usage: {},
          }),
      };

      const resolver = new NoteClarificationService(work, model, notes);
      await expect(resolver.resolve(owner, response.id)).rejects.toThrow(
        'unknown note',
      );
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'needs_clarification' });
    });

    test('a folder answer replaces an obsolete destination interpretation and preserves the original record', async () => {
      const folder = await notes.create(owner, {
        kind: 'folder',
        title: 'Keuangan Rumah',
        requestKey: 'clarified-new-note-folder',
      });

      const obsolete = await notes.create(owner, {
        kind: 'note',
        title: 'Pengeluaran Lama',
        requestKey: 'obsolete-destination',
      });

      await work.mark(pending.id, owner, 'needs_clarification', {
        ...(pending.payload as NoteWorkPayload),
        explicitRef: `custom:${obsolete.id}`,
        requestedDestination: { title: 'Pengeluaran Lama', parentId: null },
        selected: {
          ref: `custom:${obsolete.id}`,
          title: 'Pengeluaran Lama',
          parentId: null,
          question: null,
        },
      });
      await db.noteWork.update({
        where: { id: pending.id },
        data: { destinationRef: `custom:${obsolete.id}` },
      });
      await work.publishQuestions(12, owner);
      const response = await answer('Di folder Keuangan Rumah');
      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'new-note-folder-answer',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.resolutions
                ? {
                    remainingRecords: false,
                    resolutions: [
                      {
                        workId: pending.id,
                        action: 'resolve',
                        quote: response.content,
                        destinationRef: null,
                      },
                    ],
                  }
                : request.outputSchema?.properties?.items
                  ? {
                      items: [
                        {
                          quote: 'pengeluaran hari ini Rp55.000',
                          topic: 'Pengeluaran',
                          text: 'Total pengeluaran Rp55.000',
                          date: '2026-10-31',
                          explicitRef: null,
                          question: null,
                          organize: !(
                            JSON.parse(
                              request.messages[1]!.content as string,
                            ) as { clarifications?: unknown[] }
                          ).clarifications?.length,
                          requestedDestination: {
                            title: 'Pengeluaran Lama',
                            parentId: null,
                          },
                        },
                      ],
                    }
                  : request.outputSchema?.properties?.ref
                    ? {
                        ref: null,
                        title: 'Pengeluaran',
                        parentId: folder.id,
                        question: null,
                      }
                    : {
                        append: '2026-10-31: Total pengeluaran Rp55.000',
                        replacements: [],
                        question: null,
                      },
            ),
            usage: {},
          }),
      };

      const organizer = new NoteOrganizationService(
        work,
        presence,
        model,
        notes,
        daily,
        new ConfigService({ BACKEND_NOTE_ORGANIZATION_MODE: 'apply' }),
        new NoteClarificationService(work, model, notes),
      );

      expect(await organizer.captureMessage(owner, response.id)).toMatchObject({
        records: [expect.objectContaining({ status: 'applied' })],
      });
      const workspace = await notes.list(owner);
      const resolved = workspace.notes.find(
        (note) => note.parentId === folder.id,
      );

      expect(resolved).toMatchObject({
        title: 'Pengeluaran',
        parentId: folder.id,
      });
      expect((await notes.find(owner, resolved!.id)).text).toBe(
        '2026-10-31: Total pengeluaran Rp55.000',
      );
      expect((await notes.find(owner, obsolete.id)).text).toBe('');
      await organizer.captureMessage(owner, response.id);
      expect((await notes.list(owner)).notes).toHaveLength(2);
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, sourceRef: messageId, stage: 'source' },
      });

      await work.spawn(source, 'review:clarified-record', 'review', {});
      await organizer.review(owner, 'apply');
      await organizer.review(owner, 'apply');
      expect((await notes.find(owner, obsolete.id)).text).toBe('');
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
    });

    test('a grounded answer resumes the original capture in the selected custom note', async () => {
      const destination = await notes.create(owner, {
        kind: 'note',
        title: 'Pengeluaran Rumah',
        requestKey: randomUUID(),
      });

      await work.publishQuestions(12, owner);
      const response = await answer();
      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'clarification-boundary-fixture',
        generate: (request) => {
          if (request.outputSchema?.properties?.items)
            return Promise.reject(
              new Error(
                'An answer-only message must not be reclassified as a new record.',
              ),
            );

          if (request.outputSchema?.properties?.append) {
            const input = JSON.parse(
              request.messages[1]!.content as string,
            ) as {
              destination?: { ref: string };
            };

            if (input.destination?.ref !== `custom:${destination.id}`)
              return Promise.reject(
                new Error('The merge step needs the resolved destination.'),
              );
          }

          return Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.resolutions
                ? {
                    remainingRecords: false,
                    resolutions: [
                      {
                        workId: pending.id,
                        action: 'resolve',
                        quote: 'Di catatan Rumah',
                        destinationRef: `custom:${destination.id}`,
                      },
                    ],
                  }
                : request.outputSchema?.properties?.items
                  ? { items: [] }
                  : {
                      append: '2026-10-31 · Total pengeluaran Rp55.000',
                      replacements: [],
                      question: null,
                    },
            ),
            usage: {},
          });
        },
      };

      const resolver = new NoteClarificationService(work, model, notes);
      const organizer = new NoteOrganizationService(
        work,
        presence,
        model,
        notes,
        daily,
        new ConfigService({
          BACKEND_NOTE_ORGANIZATION_MODE: 'apply',
          BACKEND_MEMORY_DREAM_IDLE_MS: 0,
        }),
        resolver,
      );

      const receipt = await organizer.captureMessage(owner, response.id);
      expect(receipt).toMatchObject({
        records: [
          expect.objectContaining({
            status: 'applied',
            ref: `custom:${destination.id}`,
          }),
        ],
      });
      expect((await notes.find(owner, destination.id)).text).toBe(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
    });
  },
);
