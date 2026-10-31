import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
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
import type {
  LanguageModelGateway,
  GenerateRequest,
} from '../../src/infra/model-gateway';
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
import { NoteOrganizationSchedulerService } from '../../src/modules/notes/note-organization-scheduler.service';
import {
  processNoteOrganizationJob,
  registerNoteOrganizationRecovery,
} from '../../src/modules/notes/note-organization.job';
import { Queue, QueueEvents, Worker } from 'bullmq';
import type { NoteOrganizationJob } from '../../src/infra/queue';

const enabled = process.env.NOTES_CONTRACT_ENABLED === 'true';
const evidence = 'Pengeluaran saya hari ini Rp55.000';

// Labeled model-boundary fixture: one dated aggregate, never an extra transaction.
function expenseModel(): LanguageModelGateway {
  return {
    provider: 'openrouter',
    model: 'expense-total-fixture',
    generate: (request: GenerateRequest) => {
      const properties = request.outputSchema?.properties;
      const value = properties?.items
        ? {
            items: [
              {
                quote: evidence,
                purpose: 'tracking',
                operation: 'total',
                topic: 'Pengeluaran',
                text: 'Total pengeluaran Rp55.000',
                date: '2026-10-31',
                explicitRef: null,
                explicitOnly: false,
                organize: true,
                question: null,
              },
            ],
          }
        : properties?.ref
          ? { ref: null, title: 'Pengeluaran', parentId: null, question: null }
          : {
              append: '2026-10-31 · Total pengeluaran Rp55.000',
              replacements: [],
              question: null,
            };

      return Promise.resolve({ text: JSON.stringify(value), usage: {} });
    },
  };
}

(enabled ? describe : describe.skip)(
  'Background record organization with PostgreSQL',
  () => {
    const owner = `organize-${randomUUID()}`;
    let db: PrismaService,
      work: PrismaNoteWorkRepository,
      presence: PrismaNotePresenceRepository,
      daily: DailyNoteService,
      notes: NotesService;

    let messageId: string;

    function organizer(
      mode: 'apply' | 'proposal' = 'apply',
      model: LanguageModelGateway = expenseModel(),
    ) {
      return new NoteOrganizationService(
        work,
        presence,
        model,
        notes,
        daily,
        new ConfigService({
          BACKEND_NOTE_ORGANIZATION_MODE: mode,
          BACKEND_MEMORY_DREAM_IDLE_MS: 0,
        }),
      );
    }

    async function processStages(service: NoteOrganizationService) {
      await service.recover(owner);
      await service.recover(owner);
      await service.recover(owner);
    }

    beforeAll(async () => {
      const config = new ConfigService({
        BACKEND_DB_URL: process.env.BACKEND_DB_URL,
        BACKEND_MODEL_API_KEY: '',
      });

      db = new PrismaService(config);
      await db.user.create({
        data: {
          id: owner,
          name: 'Organizer contract',
          email: `${owner}@test.invalid`,
          timezone: 'Asia/Makassar',
          automaticMemoryEnabled: false,
        },
      });
      const queue = {
        dailyNoteIndexes: { add: () => Promise.resolve({ id: 'test-index' }) },
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
      await db.noteEditorPresence.deleteMany({ where: { userId: owner } });
      await db.dailyNote.deleteMany({ where: { userId: owner } });
      await db.workspaceItem.deleteMany({ where: { userId: owner } });
      await db.conversation.deleteMany({ where: { userId: owner } });
      const conversation = await db.conversation.create({
        data: { userId: owner },
      });

      messageId = (
        await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content: evidence,
          },
        })
      ).id;

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
    test('a single implicit report is organized when automatic memory is disabled', async () => {
      await processStages(organizer());
      const workspace = await notes.list(owner);
      expect(workspace.items).toHaveLength(1);
      const custom = await notes.find(owner, workspace.items[0]!.id);
      expect(custom).toMatchObject({
        title: 'Pengeluaran',
        text: '2026-10-31 · Total pengeluaran Rp55.000',
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toContain(
        'Total pengeluaran Rp55.000',
      );
      expect(
        (await daily.findByDate(owner, '2026-10-31'))?.content,
      ).toMatchObject({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'paragraph',
            content: [
              {
                type: 'noteLink',
                attrs: { target: `custom:${custom.id}`, label: 'Pengeluaran' },
              },
            ],
          }),
        ]),
      });
    });
    test.each([false, true])(
      'idle review preserves record identity when the initial organization decision is %s',
      async (initialOrganization) => {
        const boundary = expenseModel();
        const model: LanguageModelGateway = {
          ...boundary,
          generate: async (request) => {
            if (!request.outputSchema?.properties?.items)
              return boundary.generate(request);
            const input = JSON.parse(
              request.messages[1]!.content as string,
            ) as {
              phase?: string;
            };

            return {
              text: JSON.stringify({
                items: [
                  {
                    quote:
                      input.phase === 'organization_review'
                        ? 'saya hari ini Rp55.000'
                        : evidence,
                    topic: 'Pengeluaran',
                    text: 'Total pengeluaran Rp55.000',
                    date: '2026-10-31',
                    explicitRef: null,
                    question: null,
                    organize:
                      input.phase === 'organization_review' ||
                      initialOrganization,
                  },
                ],
              }),
              usage: {},
            };
          },
        };

        const service = organizer('apply', model);

        expect(await service.captureMessage(owner, messageId)).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        expect((await notes.list(owner)).items).toEqual([]);
        await work.expedite(owner);
        await processStages(service);

        const workspace = await notes.list(owner);
        expect(workspace.items).toHaveLength(1);
        expect((await notes.find(owner, workspace.items[0]!.id)).text).toMatch(
          /55[.,]?000/,
        );
        expect(
          (await notes.find(owner, workspace.items[0]!.id)).text.match(
            /55[.,]?000/g,
          ),
        ).toHaveLength(1);
        expect(
          await db.noteWork.count({
            where: {
              userId: owner,
              sourceRef: messageId,
              stage: 'capture',
              status: 'applied',
            },
          }),
        ).toBe(1);
      },
    );

    test('a review cannot substitute an unknown durable record identity', async () => {
      const boundary = expenseModel();
      const model: LanguageModelGateway = {
        ...boundary,
        generate: async (request) => {
          const result = await boundary.generate(request);
          if (!request.outputSchema?.properties?.items) return result;
          const input = JSON.parse(request.messages[1]!.content as string) as {
            phase?: string;
          };

          const fixture = JSON.parse(result.text) as {
            items: Array<Record<string, unknown>>;
          };

          return {
            ...result,
            text: JSON.stringify({
              items: fixture.items.map((item) => ({
                ...item,
                organize: input.phase === 'organization_review',
                sourceItemKey:
                  input.phase === 'organization_review'
                    ? 'foreign-record'
                    : null,
              })),
            }),
          };
        },
      };

      const service = organizer('apply', model);

      expect(await service.captureMessage(owner, messageId)).toMatchObject({
        records: [expect.objectContaining({ status: 'applied' })],
      });
      await work.expedite(owner);
      await service.recover(owner);

      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'review' },
        }),
      ).toMatchObject({
        status: 'failed',
        lastErrorCode: 'unmapped_review_item',
        sourceContent: evidence,
      });
      expect((await notes.list(owner)).items).toEqual([]);
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toMatch(
        /55[.,]?000/,
      );
    });

    test('a model-selected new title differing only by case reuses the existing tracker', async () => {
      const existing = await notes.create(owner, {
        kind: 'note',
        title: 'pengeluaran',
        requestKey: 'existing-lowercase-tracker',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Catatan lama tetap tersedia.' }],
            },
          ],
        },
      });

      await processStages(organizer());

      expect((await notes.list(owner)).items).toHaveLength(1);
      expect((await notes.find(owner, existing.id)).text).toBe(
        'Catatan lama tetap tersedia.\n2026-10-31 · Total pengeluaran Rp55.000',
      );
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'organize', status: 'applied' },
        }),
      ).toBe(1);
      expect(
        await db.noteWork.count({ where: { userId: owner, status: 'failed' } }),
      ).toBe(0);
    });

    test('repeated scans do not duplicate the organized record', async () => {
      const service = organizer();
      await processStages(service);
      await processStages(service);
      const workspace = await notes.list(owner);
      expect(workspace.items).toHaveLength(1);
      expect((await notes.find(owner, workspace.items[0]!.id)).text).toBe(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
    });

    test('overlapping workers apply one capture and one dedicated record', async () => {
      await Promise.all([
        processStages(organizer()),
        processStages(organizer()),
      ]);

      const workspace = await notes.list(owner);
      expect(workspace.items).toHaveLength(1);
      expect((await notes.find(owner, workspace.items[0]!.id)).text).toBe(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toContain(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'capture', status: 'applied' },
        }),
      ).toBe(1);
      expect(
        await db.noteWork.count({
          where: { userId: owner, stage: 'organize', status: 'applied' },
        }),
      ).toBe(1);
    });

    test('removing source evidence invalidates unapplied capture and organization', async () => {
      const service = organizer();
      await service.recover(owner);
      await db.message.delete({ where: { id: messageId } });

      await processStages(service);

      expect((await notes.list(owner)).items).toEqual([]);
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect(
        await db.noteWork.count({
          where: {
            userId: owner,
            stage: { in: ['capture', 'organize'] },
            status: 'stale',
          },
        }),
      ).toBe(2);
    });

    test('an unrelated daily edit does not restore a record removed from its dedicated note', async () => {
      const boundary = expenseModel();
      const model: LanguageModelGateway = {
        ...boundary,
        generate: (request) => {
          if (request.outputSchema?.properties?.items) {
            const input = JSON.parse(
              request.messages[1]!.content as string,
            ) as {
              source: string;
            };

            if (!input.source.includes(evidence))
              return Promise.resolve({
                text: JSON.stringify({ items: [] }),
                usage: {},
              });
          }

          if (request.outputSchema?.properties?.ref) {
            const input = JSON.parse(
              request.messages[1]!.content as string,
            ) as {
              notes: Array<{ ref: string }>;
            };

            return Promise.resolve({
              text: JSON.stringify({
                ref: input.notes[0]?.ref ?? null,
                title: 'Pengeluaran',
                parentId: null,
                question: null,
              }),
              usage: {},
            });
          }

          return request.outputSchema?.properties?.append
            ? Promise.resolve({
                text: JSON.stringify({
                  append: evidence,
                  replacements: [],
                  question: null,
                }),
                usage: {},
              })
            : boundary.generate(request);
        },
      };

      const service = organizer('apply', model);
      await processStages(service);
      const workspace = await notes.list(owner);
      const destination = await notes.find(owner, workspace.items[0]!.id);
      await notes.update(owner, destination.id, {
        revision: destination.revision,
        content: { type: 'doc', content: [] },
      });
      const day = await daily.findByDate(owner, '2026-10-31');
      if (!day) throw new Error('The source capture must exist.');

      await daily.save(owner, {
        date: '2026-10-31',
        sourceType: 'dashboard',
        expectedUpdatedAt: day.updatedAt,
        document: {
          type: 'doc',
          content: [
            ...day.content.content,
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Hari ini hujan.' }],
            },
          ],
        },
      });

      await processStages(service);

      expect((await notes.find(owner, destination.id)).text).toBe('');
      expect((await notes.list(owner)).items).toHaveLength(1);
      expect(
        await db.noteWork.count({ where: { userId: owner, status: 'failed' } }),
      ).toBe(0);
    });

    test('a trashed tracker is not recreated for a later record', async () => {
      const service = organizer();
      await processStages(service);
      const workspace = await notes.list(owner);
      const destination = workspace.items[0]!;
      await notes.execute(owner, {
        action: 'trash',
        id: destination.id,
        revision: destination.revision,
      });
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const later = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content: evidence,
        },
      });

      await service.captureMessage(owner, later.id);
      await processStages(service);

      expect((await notes.list(owner)).items).toEqual([
        expect.objectContaining({
          id: destination.id,
          trashedAt: expect.any(Date),
        }),
      ]);
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, sourceRef: later.id, stage: 'organize' },
        }),
      ).toMatchObject({ status: 'needs_clarification' });
    });

    test('an ungrounded model quote fails with a diagnosable code and preserves the source', async () => {
      const boundary = expenseModel();
      const model: LanguageModelGateway = {
        ...boundary,
        generate: async (request) => {
          const result = await boundary.generate(request);
          const extraction = JSON.parse(result.text) as {
            items: Array<{ quote: string }>;
          };

          extraction.items[0]!.quote = 'Pengeluaran Rp99.000';

          return { ...result, text: JSON.stringify(extraction) };
        },
      };

      expect(
        await organizer('apply', model).captureMessage(owner, messageId),
      ).toEqual({
        status: 'failed',
        saved: false,
      });
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect((await notes.list(owner)).items).toEqual([]);
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'failed',
        lastErrorCode: 'ungrounded_quote',
        sourceContent: evidence,
      });
    });

    test('a new transaction cannot be completed by an empty merge plan', async () => {
      const conversation = await db.conversation.create({
        data: { userId: owner },
      });

      const message = await db.message.create({
        data: {
          userId: owner,
          conversationId: conversation.id,
          role: 'user',
          content: 'Tambah pengeluaran makan Rp20.000.',
        },
      });

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'omitted-new-entry-boundary',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.items
                ? {
                    items: [
                      {
                        quote: message.content,
                        operation: 'entry',
                        purpose: 'tracking',
                        topic: 'Pengeluaran',
                        text: '2026-10-31: makan Rp20.000',
                        date: '2026-10-31',
                        explicitRef: null,
                        explicitOnly: false,
                        organize: true,
                        question: null,
                      },
                    ],
                  }
                : { append: '', replacements: [], question: null },
            ),
            usage: {},
          }),
      };

      expect(
        await organizer('apply', model).captureMessage(owner, message.id),
      ).toEqual({ status: 'failed', saved: false });
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, sourceRef: message.id, stage: 'source' },
        }),
      ).toMatchObject({ status: 'failed', lastErrorCode: 'empty_record' });
      expect(
        await db.noteWork.count({
          where: { userId: owner, sourceRef: message.id, status: 'applied' },
        }),
      ).toBe(0);
    });

    test('an empty new aggregate cannot report a successful note write', async () => {
      const boundary = expenseModel();
      const model: LanguageModelGateway = {
        ...boundary,
        generate: (request) =>
          request.outputSchema?.properties?.append
            ? Promise.resolve({
                text: JSON.stringify({
                  append: '',
                  replacements: [],
                  question: null,
                }),
                usage: {},
              })
            : boundary.generate(request),
      };

      expect(
        await organizer('apply', model).captureMessage(owner, messageId),
      ).toEqual({ status: 'failed', saved: false });
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({ status: 'failed', lastErrorCode: 'empty_record' });
    });

    test('legacy pending records apply without requiring semantic labels', async () => {
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      await work.mark(source.id, owner, 'planned');
      const legacy = await work.spawn(
        source,
        'legacy-capture',
        'capture',
        {
          quote: evidence,
          purpose: 'tracking',
          topic: 'Pengeluaran',
          text: 'Total pengeluaran Rp55.000',
          date: '2026-10-31',
          explicitRef: null,
          explicitOnly: false,
          organize: true,
          question: null,
        },
        'daily:2026-10-31',
      );

      const model = expenseModel();

      const receipt = await organizer('apply', model).captureMessage(
        owner,
        messageId,
      );

      expect(receipt).toMatchObject({
        records: [
          expect.objectContaining({
            status: 'applied',
            ref: 'daily:2026-10-31',
          }),
        ],
      });
      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: legacy.id } }),
      ).toMatchObject({
        payload: { quote: evidence },
        destinationRef: 'daily:2026-10-31',
        status: 'applied',
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toContain(
        '55.000',
      );
    });

    test.each([
      {
        scenario: 'an unresolved terse correction',
        content: 'Sebenarnya Rp65.000.',
        evidence: null,
        replaceBefore: 'Rp20.000',
        receipt: {
          records: [expect.objectContaining({ status: 'needs_clarification' })],
        },
        status: 'planned',
        error: null,
      },
      {
        scenario: 'an unresolved target among multiple expenses',
        content: 'Koreksi pengeluaran makan menjadi Rp65.000.',
        evidence: 'makan',
        replaceBefore: 'Rp30.000',
        receipt: {
          records: [expect.objectContaining({ status: 'needs_clarification' })],
        },
        status: 'planned',
        error: null,
      },
    ])(
      'retains $scenario when the model requests clarification',
      async ({ content, receipt, status, error }) => {
        const stored = await daily.save(owner, {
          date: '2026-10-31',
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'makan Rp20.000' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'transportasi Rp30.000' }],
              },
            ],
          },
        });

        if (!stored) throw new Error('The two target records must exist.');
        const conversation = await db.conversation.create({
          data: { userId: owner },
        });

        const message = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content,
          },
        });

        const model: LanguageModelGateway = {
          provider: 'openrouter',
          model: 'unsupported-correction-target',
          generate: (request) =>
            Promise.resolve({
              text: JSON.stringify(
                request.outputSchema?.properties?.items
                  ? {
                      items: [
                        {
                          quote: content,
                          purpose: 'tracking',
                          operation: 'correction',
                          topic: 'Pengeluaran',
                          text: 'Koreksi Rp65.000',
                          date: '2026-10-31',
                          explicitRef: null,
                          explicitOnly: false,
                          organize: true,
                          question: null,
                        },
                      ],
                    }
                  : {
                      append: '',
                      replacements: [],
                      question: 'Makan atau transportasi yang ingin dikoreksi?',
                    },
              ),
              usage: {},
            }),
        };

        expect(
          await organizer('apply', model).captureMessage(owner, message.id),
        ).toMatchObject(receipt);
        expect((await daily.findByDate(owner, '2026-10-31'))?.content).toEqual(
          stored.content,
        );
        expect(
          await db.noteWork.findFirstOrThrow({
            where: { userId: owner, sourceRef: message.id, stage: 'source' },
          }),
        ).toMatchObject({ status, lastErrorCode: error });
      },
    );

    test('a grounded review can reject a proposed edit that assumes an unresolved target', async () => {
      const prior = await db.message.update({
        where: { id: messageId },
        data: { content: 'Makan Rp20.000 dan transportasi Rp30.000.' },
      });

      const before = await daily.save(owner, {
        date: '2026-10-31',
        document: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Makan Rp20.000' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Transportasi Rp30.000' }],
            },
          ],
        },
      });

      const correction = await db.message.create({
        data: {
          userId: owner,
          conversationId: prior.conversationId,
          role: 'user',
          content: 'Sebenarnya Rp65.000.',
        },
      });

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'grounded-plan-review',
        generate: (request) => {
          const input = JSON.parse(request.messages[1]!.content as string) as {
            proposedDocument?: unknown;
          };

          const value = request.outputSchema?.properties?.items
            ? {
                items: [
                  {
                    quote: correction.content,
                    topic: 'Pengeluaran',
                    text: 'Rp65.000',
                    date: '2026-10-31',
                    explicitRef: null,
                    organize: false,
                    question: null,
                  },
                ],
              }
            : input.proposedDocument
              ? {
                  append: '',
                  replacements: [],
                  question: 'Makan atau transportasi yang dikoreksi?',
                }
              : { append: 'Total Rp65.000', replacements: [], question: null };

          return Promise.resolve({ text: JSON.stringify(value), usage: {} });
        },
      };

      expect(
        await organizer('apply', model).captureMessage(owner, correction.id),
      ).toMatchObject({
        records: [expect.objectContaining({ status: 'needs_clarification' })],
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.content).toEqual(
        before?.content,
      );
    });

    test('two records on one document line still require a correction target', async () => {
      const line = 'makan Rp20.000; transportasi Rp30.000';
      const original = await daily.save(owner, {
        date: '2026-10-31',
        document: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: line }] },
          ],
        },
      });

      const conversation = await db.conversation.create({
        data: { userId: owner },
      });

      const message = await db.message.create({
        data: {
          userId: owner,
          conversationId: conversation.id,
          role: 'user',
          content: 'Sebenarnya Rp65.000.',
        },
      });

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'multi-record-single-line',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.items
                ? {
                    items: [
                      {
                        quote: message.content,
                        operation: 'correction',
                        purpose: 'tracking',
                        topic: 'Pengeluaran',
                        text: 'Koreksi Rp65.000',
                        date: '2026-10-31',
                        explicitRef: null,
                        explicitOnly: false,
                        organize: true,
                        question: null,
                      },
                    ],
                  }
                : {
                    append: '',
                    replacements: [],
                    question: 'Makan atau transportasi yang dikoreksi?',
                  },
            ),
            usage: {},
          }),
      };

      expect(
        await organizer('apply', model).captureMessage(owner, message.id),
      ).toMatchObject({
        records: [expect.objectContaining({ status: 'needs_clarification' })],
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.content).toEqual(
        original?.content,
      );
    });

    test('successful recovery clears a previous decision failure code', async () => {
      const source = await db.noteWork.findFirstOrThrow({
        where: { userId: owner, stage: 'source' },
      });

      await work.fail(source.id, owner, 'ungrounded_quote');

      await organizer().captureMessage(owner, messageId);

      expect(
        await db.noteWork.findUniqueOrThrow({ where: { id: source.id } }),
      ).toMatchObject({ status: 'planned', lastErrorCode: null });
    });

    test.each([
      {
        scenario: 'default capture day',
        content: 'Pengeluaran saya kemarin Rp55.000.',
        ref: null,
        captureDate: '2026-10-31',
        sourceAt: '2026-10-31T01:00:00Z',
      },
      {
        scenario: 'explicit capture day',
        content:
          'Catat pengeluaran saya kemarin Rp55.000 di catatan harian hari ini.',
        ref: 'daily:2026-10-31',
        captureDate: '2026-10-31',
        sourceAt: '2026-10-31T01:00:00Z',
      },
      {
        scenario: 'source day before midnight despite delayed execution',
        content: 'Pengeluaran saya hari ini Rp55.000.',
        ref: null,
        captureDate: '2026-10-30',
        sourceAt: '2026-10-30T15:59:00Z',
      },
    ])(
      'keeps the record date separate from the $scenario',
      async ({ content, ref, captureDate, sourceAt }) => {
        const conversation = await db.conversation.create({
          data: { userId: owner },
        });

        const message = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content,
            createdAt: new Date(sourceAt),
          },
        });

        const model: LanguageModelGateway = {
          provider: 'openrouter',
          model: 'record-date-boundary',
          generate: (request) =>
            Promise.resolve({
              text: JSON.stringify(
                request.outputSchema?.properties?.items
                  ? {
                      items: [
                        {
                          quote: content,
                          purpose: 'tracking',
                          operation: 'total',
                          topic: 'Pengeluaran',
                          text: '2026-10-30 · Total pengeluaran Rp55.000',
                          date: '2026-10-30',
                          explicitRef: ref,
                          explicitOnly: ref !== null,
                          organize: ref === null,
                          question: null,
                        },
                      ],
                    }
                  : {
                      append: '2026-10-30 · Total pengeluaran Rp55.000',
                      replacements: [],
                      question: null,
                    },
              ),
              usage: {},
            }),
        };

        const receipt = await organizer('apply', model).captureMessage(
          owner,
          message.id,
        );

        expect(receipt).toMatchObject({
          records: [
            expect.objectContaining({
              status: 'applied',
              ref: `daily:${captureDate}`,
            }),
          ],
        });
        expect((await daily.findByDate(owner, captureDate))?.text).toContain(
          '2026-10-30',
        );
        expect(
          await daily.list(owner, { from: '2026-10-30', to: '2026-10-31' }),
        ).toHaveLength(1);
      },
    );

    test('a changed dashboard source invalidates stale proposals and organizes only current evidence', async () => {
      await db.noteWork.deleteMany({ where: { userId: owner } });
      await db.conversation.deleteMany({ where: { userId: owner } });
      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'editable-source-boundary',
        generate: (request) => {
          const input = JSON.parse(request.messages[1]!.content as string) as {
            source?: string;
            evidence?: { text: string };
          };

          const value = request.outputSchema?.properties?.items
            ? {
                items: [
                  {
                    quote: input.source,
                    text: input.source,
                    purpose: 'tracking',
                    operation: 'total',
                    topic: 'Pengeluaran',
                    date: '2026-10-31',
                    explicitRef: null,
                    explicitOnly: false,
                    organize: true,
                    question: null,
                  },
                ],
              }
            : request.outputSchema?.properties?.ref
              ? {
                  ref: null,
                  title: 'Pengeluaran',
                  parentId: null,
                  question: null,
                }
              : {
                  append: input.evidence?.text,
                  replacements: [],
                  question: null,
                };

          return Promise.resolve({ text: JSON.stringify(value), usage: {} });
        },
      };

      const original = await daily.save(owner, {
        date: '2026-10-31',
        sourceType: 'dashboard',
        document: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: evidence }] },
          ],
        },
      });

      if (!original) throw new Error('The dashboard source must exist.');

      await processStages(organizer('proposal', model));
      expect((await notes.list(owner)).items).toEqual([]);
      await daily.save(owner, {
        date: '2026-10-31',
        sourceType: 'dashboard',
        expectedUpdatedAt: original.updatedAt,
        document: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Pengeluaran saya hari ini Rp65.000' },
              ],
            },
          ],
        },
      });
      await work.expedite(owner);

      await processStages(organizer('apply', model));

      const workspace = await notes.list(owner);
      expect(workspace.items).toHaveLength(1);
      expect((await notes.find(owner, workspace.items[0]!.id)).text).toBe(
        'Pengeluaran saya hari ini Rp65.000',
      );
      expect(
        await db.noteWork.count({ where: { userId: owner, status: 'stale' } }),
      ).toBe(3); // Source, organization proposal, and independent idle review.
      expect(
        await db.noteWork.count({ where: { userId: owner, status: 'failed' } }),
      ).toBe(0);
      expect(await db.conversation.count({ where: { userId: owner } })).toBe(0);
    });

    test('an explicit new note in a confirmed folder is captured durably without a daily detour', async () => {
      const folder = await notes.create(owner, {
        kind: 'folder',
        title: 'Keuangan',
        requestKey: 'explicit-folder',
      });

      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const message = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content:
            'Catat pengeluaran saya hari ini Rp55.000 di catatan Pengeluaran dalam folder Keuangan.',
        },
      });

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'explicit-folder-capture',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.items
                ? {
                    items: [
                      {
                        quote: message.content,
                        operation: 'total',
                        purpose: 'tracking',
                        topic: 'Pengeluaran',
                        text: '2026-10-31: total pengeluaran Rp55.000',
                        date: '2026-10-31',
                        explicitRef: null,
                        explicitOnly: true,
                        organize: false,
                        question: null,
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
                      append: '2026-10-31: total pengeluaran Rp55.000',
                      replacements: [],
                      question: null,
                    },
            ),
            usage: {},
          }),
      };

      const receipt = await organizer('apply', model).captureMessage(
        owner,
        message.id,
      );

      expect(receipt).toMatchObject({
        records: [expect.objectContaining({ status: 'applied' })],
      });
      const workspace = await notes.list(owner);
      expect(workspace.items).toHaveLength(2);
      expect(workspace.notes).toMatchObject([
        { title: 'Pengeluaran', parentId: folder.id },
      ]);
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect(
        await db.noteWork.count({
          where: { userId: owner, sourceRef: message.id, stage: 'organize' },
        }),
      ).toBe(0);
    });

    test('a grounded structural plan persists rich text and replays once', async () => {
      const task = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Baca', marks: [{ type: 'bold' }] }],
      };

      const link = {
        type: 'paragraph',
        content: [
          {
            type: 'noteLink',
            attrs: { target: 'daily:2026-10-30', label: 'Kemarin' },
          },
        ],
      };

      await daily.save(owner, {
        date: '2026-10-31',
        sourceType: 'dashboard',
        document: { type: 'doc', content: [task, link] },
      });
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const message = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content:
            'Ubah Baca menjadi daftar berpoin di catatan harian hari ini. Pertahankan tautan Kemarin.',
        },
      });

      const list = {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [task] }],
      };

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'structural-plan',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.items
                ? {
                    items: [
                      {
                        quote: message.content,
                        topic: 'Bacaan',
                        text: message.content,
                        date: '2026-10-31',
                        explicitRef: 'daily:2026-10-31',
                        organize: false,
                        question: null,
                      },
                    ],
                  }
                : {
                    append: '',
                    replacements: [],
                    blockReplacements: [{ before: [task], after: [list] }],
                    question: null,
                  },
            ),
            usage: {},
          }),
      };

      const service = organizer('apply', model);

      expect(await service.captureMessage(owner, message.id)).toMatchObject({
        records: [expect.objectContaining({ status: 'applied' })],
      });
      expect(await service.captureMessage(owner, message.id)).toMatchObject({
        records: [expect.objectContaining({ status: 'applied' })],
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.content).toEqual({
        type: 'doc',
        content: [list, link],
      });
      expect(
        await db.noteWork.count({
          where: {
            userId: owner,
            sourceRef: message.id,
            stage: 'capture',
            status: 'applied',
          },
        }),
      ).toBe(1);
    });

    test('one grounded request can correct an amount and add an expense without semantic labels', async () => {
      await daily.save(owner, {
        date: '2026-10-31',
        sourceType: 'dashboard',
        document: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Buku Rp25.000' }],
            },
          ],
        },
      });
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const message = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content:
            'Koreksi buku menjadi Rp30.000 dan tambah makan siang Rp20.000 di catatan harian hari ini.',
        },
      });

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'mixed-grounded-edit',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.items
                ? {
                    items: [
                      {
                        quote: message.content,
                        topic: 'Pengeluaran',
                        text: message.content,
                        date: '2026-10-31',
                        explicitRef: 'daily:2026-10-31',
                        explicitOnly: true,
                        organize: false,
                        question: null,
                      },
                    ],
                  }
                : {
                    append: 'Makan siang Rp20.000',
                    replacements: [{ before: 'Rp25.000', after: 'Rp30.000' }],
                    question: null,
                  },
            ),
            usage: {},
          }),
      };

      expect(
        await organizer('apply', model).captureMessage(owner, message.id),
      ).toMatchObject({
        records: [expect.objectContaining({ status: 'applied' })],
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toBe(
        'Buku Rp30.000\nMakan siang Rp20.000',
      );
      expect(
        await db.noteWork.count({
          where: {
            userId: owner,
            sourceRef: message.id,
            stage: 'capture',
            status: 'applied',
          },
        }),
      ).toBe(1);
    });

    test.each([
      [
        'explicit request',
        'Catat total pengeluaran rumah Rp99.000 di catatan Budget Baru dalam folder Keuangan.',
      ],
      [
        'contextual request',
        'Catat total pengeluaran rumah Rp99.000 di catatan itu.',
      ],
    ])(
      'a requested new note cannot be replaced by a related tracker: %s',
      async (_scenario, content) => {
        const folder = await notes.create(owner, {
          kind: 'folder',
          title: 'Keuangan',
          requestKey: 'requested-folder',
        });

        const other = await notes.create(owner, {
          kind: 'note',
          title: 'Pengeluaran',
          requestKey: 'competing-tracker',
        });

        const original = await db.message.findUniqueOrThrow({
          where: { id: messageId },
        });

        await db.message.create({
          data: {
            userId: owner,
            conversationId: original.conversationId,
            role: 'user',
            content:
              'Untuk pengeluaran rumah, gunakan catatan Budget Baru dalam folder Keuangan.',
          },
        });

        const message = await db.message.create({
          data: {
            userId: owner,
            conversationId: original.conversationId,
            role: 'user',
            content,
          },
        });

        // The model boundary reproduces the observed semantic-match substitution.
        const model: LanguageModelGateway = {
          provider: 'openrouter',
          model: 'explicit-name-before-topic',
          generate: (request) =>
            Promise.resolve({
              text: JSON.stringify(
                request.outputSchema?.properties?.items
                  ? {
                      items: [
                        {
                          quote: message.content,
                          operation: 'total',
                          purpose: 'tracking',
                          topic: 'Pengeluaran rumah',
                          text: '2026-10-31: total pengeluaran rumah Rp99.000',
                          date: '2026-10-31',
                          explicitRef: null,
                          explicitOnly: true,
                          organize: false,
                          question: null,
                          requestedDestination: {
                            title: 'Budget Baru',
                            parentId: folder.id,
                          },
                        },
                      ],
                    }
                  : request.outputSchema?.properties?.ref
                    ? {
                        ref: `custom:${other.id}`,
                        title: other.title,
                        parentId: null,
                        question: null,
                      }
                    : {
                        append: '2026-10-31: total pengeluaran rumah Rp99.000',
                        replacements: [],
                        question: null,
                      },
              ),
              usage: {},
            }),
        };

        expect(
          await organizer('apply', model).captureMessage(owner, message.id),
        ).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const workspace = await notes.list(owner);
        expect(workspace.notes).toContainEqual(
          expect.objectContaining({
            title: 'Budget Baru',
            parentId: folder.id,
          }),
        );
        expect((await notes.find(owner, other.id)).text).toBe('');
        expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      },
    );

    test('an explicit unresolved folder keeps a clarification record rather than a daily capture', async () => {
      const original = await db.message.findUniqueOrThrow({
        where: { id: messageId },
      });

      const message = await db.message.create({
        data: {
          userId: owner,
          conversationId: original.conversationId,
          role: 'user',
          content:
            'Catat pengeluaran Rp55.000 dalam catatan Pengeluaran di folder Keuangan.',
        },
      });

      const model: LanguageModelGateway = {
        provider: 'openrouter',
        model: 'ambiguous-folder-capture',
        generate: (request) =>
          Promise.resolve({
            text: JSON.stringify(
              request.outputSchema?.properties?.items
                ? {
                    items: [
                      {
                        quote: message.content,
                        operation: 'total',
                        purpose: 'tracking',
                        topic: 'Pengeluaran',
                        text: 'Total Rp55.000',
                        date: '2026-10-31',
                        explicitRef: null,
                        explicitOnly: true,
                        organize: false,
                        question: null,
                      },
                    ],
                  }
                : {
                    ref: null,
                    title: 'Pengeluaran',
                    parentId: null,
                    question: 'Folder Keuangan yang mana?',
                  },
            ),
            usage: {},
          }),
      };

      expect(
        await organizer('apply', model).captureMessage(owner, message.id),
      ).toMatchObject({
        records: [
          expect.objectContaining({ status: 'needs_clarification', ref: null }),
        ],
      });
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect((await notes.list(owner)).items).toEqual([]);
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, sourceRef: message.id, stage: 'capture' },
        }),
      ).toMatchObject({
        sourceContent: message.content,
        status: 'needs_clarification',
      });
    });

    (process.env.NOTES_QUEUE_CONTRACT_ENABLED === 'true' ? test : test.skip)(
      'a real idle queue run preserves work across worker restart and recovers it independently of memory',
      async () => {
        await db.noteWork.deleteMany({ where: { userId: owner } });
        const original = await db.message.findUniqueOrThrow({
          where: { id: messageId },
        });

        const redisUrl = process.env.BACKEND_REDIS_URL;
        if (!redisUrl)
          throw new Error(
            'BACKEND_REDIS_URL is required for the enabled queue contract.',
          );
        const connection = { url: redisUrl };
        const name = `note-organization-contract-${randomUUID()}`;
        const queue = new Queue<NoteOrganizationJob>(name, { connection });
        const events = new QueueEvents(name, { connection });
        let worker: Worker<NoteOrganizationJob> | undefined;

        try {
          await events.waitUntilReady();
          const scheduler = new NoteOrganizationSchedulerService(
            work,
            { noteOrganizations: queue } as QueueService,
            new ConfigService({ BACKEND_MEMORY_DREAM_IDLE_MS: 50 }),
          );

          await scheduler.schedule(owner, original.conversationId, messageId);
          const [job] = await queue.getJobs(['delayed', 'waiting']);
          if (!job)
            throw new Error(
              'The idle organization job must be durable in Redis.',
            );
          expect(
            await db.noteWork.findFirstOrThrow({
              where: { userId: owner, stage: 'source' },
            }),
          ).toMatchObject({ status: 'pending', sourceRef: messageId });
          const service = organizer();
          worker = new Worker<NoteOrganizationJob>(
            name,
            (queued) => processNoteOrganizationJob(service, queued.data),
            { connection },
          );
          await job.waitUntilFinished(events, 10_000);
          await worker.close();
          expect(
            await db.noteWork.count({
              where: { userId: owner, stage: 'organize', status: 'pending' },
            }),
          ).toBe(1);

          worker = new Worker<NoteOrganizationJob>(
            name,
            (queued) => processNoteOrganizationJob(service, queued.data),
            { connection },
          );
          const resumed = await queue.add('resume', {
            kind: 'user',
            userId: owner,
          });

          await resumed.waitUntilFinished(events, 10_000);
          const linked = await queue.add('link', {
            kind: 'user',
            userId: owner,
          });

          await linked.waitUntilFinished(events, 10_000);

          expect((await notes.list(owner)).items).toHaveLength(1);
          expect((await daily.findByDate(owner, '2026-10-31'))?.text).toContain(
            '55.000',
          );
          expect(
            await db.noteWork.count({
              where: { userId: owner, status: 'applied', stage: 'organize' },
            }),
          ).toBe(1);
          await worker.close();
          worker = undefined;
          await registerNoteOrganizationRecovery(queue);
          expect(
            (await queue.getJobSchedulers()).map((schedule) => ({
              key: schedule.key,
              every: schedule.every,
            })),
          ).toEqual(
            expect.arrayContaining([
              { key: 'note-organization-recovery', every: 86_400_000 },
              { key: 'note-organization-pending', every: 60_000 },
            ]),
          );
        } finally {
          await worker?.close();
          await events.close();
          await queue.obliterate({ force: true });
          await queue.close();
        }
      },
      30_000,
    );

    test('proposal mode produces reviewable plans without changing notes', async () => {
      await processStages(organizer('proposal'));
      expect((await notes.list(owner)).items).toEqual([]);
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        }),
      ).toMatchObject({
        status: 'proposal',
        payload: { items: expect.any(Array) },
      });
    });
    test('an open daily note keeps capture and linking pending while organization can proceed', async () => {
      await presence.acquire(owner, 'daily:2026-10-31', 'editor-a');
      await processStages(organizer());
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect((await notes.list(owner)).items).toHaveLength(1);
      expect(
        await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'capture' },
        }),
      ).toMatchObject({ status: 'deferred', lastErrorCode: 'note_open' });
    });
    test('closing a day resumes capture and its pending link without duplicating the dedicated entry', async () => {
      const service = organizer();
      await presence.acquire(owner, 'daily:2026-10-31', 'editor-a');
      await processStages(service);
      await presence.release(owner, 'daily:2026-10-31', 'editor-a');
      await db.noteWork.updateMany({
        where: { userId: owner, status: 'deferred' },
        data: { nextAttemptAt: new Date('2000-01-01') },
      });
      await processStages(service);
      expect(
        (await daily.findByDate(owner, '2026-10-31'))?.content,
      ).toMatchObject({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'paragraph',
            content: [expect.objectContaining({ type: 'noteLink' })],
          }),
        ]),
      });
      const workspace = await notes.list(owner);
      expect(workspace.items).toHaveLength(1);
      expect((await notes.find(owner, workspace.items[0]!.id)).text).toBe(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
    });

    test('immediate capture writes before the inactivity delay even while organization is proposal-only', async () => {
      const service = new NoteOrganizationService(
        work,
        presence,
        expenseModel(),
        notes,
        daily,
        new ConfigService({ BACKEND_NOTE_ORGANIZATION_MODE: 'proposal' }),
      );

      const receipt = await service.captureMessage(owner, messageId);
      expect(receipt).toMatchObject({
        records: [
          expect.objectContaining({
            status: 'applied',
            ref: 'daily:2026-10-31',
          }),
        ],
      });
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toBe(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
      expect((await notes.list(owner)).items).toEqual([]);
    });
    test('immediate capture of an open day returns a pending receipt', async () => {
      await presence.acquire(owner, 'daily:2026-10-31', 'editor-a');
      const receipt = await organizer().captureMessage(owner, messageId);
      expect(receipt).toMatchObject({
        records: [expect.objectContaining({ status: 'deferred' })],
      });
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
    });

    test('an editor opened during model planning prevents the eventual capture commit', async () => {
      const boundary = expenseModel();
      const model: LanguageModelGateway = {
        ...boundary,
        generate: async (request) => {
          if (request.outputSchema?.properties?.append)
            await presence.acquire(owner, 'daily:2026-10-31', 'late-editor');

          return boundary.generate(request);
        },
      };

      const receipt = await organizer('apply', model).captureMessage(
        owner,
        messageId,
      );

      expect(receipt).toMatchObject({
        records: [expect.objectContaining({ status: 'deferred' })],
      });
      expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      expect((await notes.list(owner)).items).toEqual([]);
    });
    test('replaying immediate capture never repeats the record', async () => {
      const service = organizer();
      await service.captureMessage(owner, messageId);
      await service.captureMessage(owner, messageId);
      expect((await daily.findByDate(owner, '2026-10-31'))?.text).toBe(
        '2026-10-31 · Total pengeluaran Rp55.000',
      );
    });
    test('a destination write and its follow-up link job roll back together', async () => {
      const service = organizer();
      await service.recover(owner);
      // PostgreSQL boundary rejects a link job, simulating a failure after the note write.
      await db.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION reject_organization_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${owner}' AND NEW.stage = 'link' THEN RAISE EXCEPTION 'link ledger unavailable'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        'CREATE TRIGGER reject_organization_link_trigger BEFORE INSERT ON note_work FOR EACH ROW EXECUTE FUNCTION reject_organization_link()',
      );

      try {
        await service.recover(owner);
        expect((await notes.list(owner)).items).toEqual([]);
        expect(
          await db.noteWork.findFirstOrThrow({
            where: { userId: owner, stage: 'organize' },
          }),
        ).toMatchObject({ status: 'failed' });
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER reject_organization_link_trigger ON note_work',
        );
        await db.$executeRawUnsafe('DROP FUNCTION reject_organization_link()');
      }
    });

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true'
      ? test.each
      : test.skip.each)([
      ['expense question', 'Berapa pengeluaran saya hari ini?', false],
      [
        'hypothetical expense',
        'Kalau misalnya saya belanja Rp55.000, bagaimana cara mengaturnya?',
        false,
      ],
      [
        'quoted example',
        'Contoh kalimat untuk latihan: "pengeluaran saya hari ini Rp55.000".',
        false,
      ],
      ['personal preference', 'Saya lebih suka jawaban singkat.', false],
      ['explicit capture', 'Catat pengeluaran saya hari ini Rp55.000', true],
      ['measurement report', 'Berat badan saya pagi ini 72 kg', true],
      ['another expense question', 'Apa total belanja saya hari ini?', false],
      [
        'another hypothetical',
        'Andaikan saya belanja Rp55.000 hari ini, apakah anggaran saya cukup?',
        false,
      ],
      [
        'another quoted example',
        'Teman saya berkata, "Saya belanja Rp55.000 hari ini".',
        false,
      ],
      [
        'another preference',
        'Untuk jawaban berikutnya, gunakan bahasa Indonesia dan ringkas saja.',
        false,
      ],
      [
        'another explicit capture',
        'Tolong simpan catatan total belanja hari ini Rp55.000.',
        true,
      ],
      [
        'another measurement',
        'Hari ini timbangan menunjukkan berat saya 72 kg.',
        true,
      ],
      [
        'negated hypothetical',
        'Saya tidak mengeluarkan Rp55.000 hari ini; itu hanya contoh.',
        false,
      ],
      [
        'cancelled expense',
        'Belanja Rp55.000 itu belum terjadi. Jangan catat sebagai pengeluaran.',
        false,
      ],
      [
        'implicit transaction',
        'Hari ini saya menghabiskan Rp55.000 untuk belanja.',
        true,
      ],
      ['implicit aggregate', 'Total belanja saya hari ini Rp55.000.', true],
    ])(
      'live recording-intent boundary: %s',
      async (_name, text, recordsExpected) => {
        const conversation = await db.conversation.create({
          data: { userId: owner },
        });

        const message = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content: text,
          },
        });

        const model = new OpenRouterLanguageModel(
          new ConfigService(process.env),
        );

        const receipt = await organizer('proposal', model).captureMessage(
          owner,
          message.id,
        );

        expect(receipt).toHaveProperty('records');
        const serialized = JSON.parse(JSON.stringify(receipt)) as {
          records: Array<{ status: string }>;
        };

        expect(serialized.records.length > 0).toBe(recordsExpected);
        expect(
          serialized.records.every((record) => record.status === 'applied'),
        ).toBe(true);
        expect(
          await db.noteWork.count({
            where: { userId: owner, sourceRef: message.id, stage: 'organize' },
          }),
        ).toBe(serialized.records.length);
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true'
      ? test.each
      : test.skip.each)([
      'Pengeluaran saya hari ini Rp55.000. Saya lebih suka jawaban singkat.',
      'Total belanja hari ini Rp55.000. Untuk percakapan berikutnya, gunakan bahasa Indonesia.',
    ])(
      'live model separates the record from a preference: %s',
      async (content) => {
        const conversation = await db.conversation.create({
          data: { userId: owner },
        });

        const message = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content,
          },
        });

        const service = organizer(
          'proposal',
          new OpenRouterLanguageModel(new ConfigService(process.env)),
        );

        const receipt = await service.captureMessage(owner, message.id);

        expect(receipt).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const day = await daily.findByDate(owner, '2026-10-31');
        expect(day?.text).toMatch(/55[.,]?000/);
        expect(day?.text).not.toMatch(
          /jawaban|singkat|bahasa|Indonesia|percakapan/i,
        );
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model keeps equal-valued transactions distinct through capture and organization',
      async () => {
        await db.noteWork.deleteMany({ where: { userId: owner } });
        await db.conversation.deleteMany({ where: { userId: owner } });
        const conversation = await db.conversation.create({
          data: { userId: owner },
        });

        const service = organizer(
          'apply',
          new OpenRouterLanguageModel(new ConfigService(process.env)),
        );

        const first = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content: 'Catat pengeluaran makan Rp20.000 hari ini.',
          },
        });

        expect(await service.captureMessage(owner, first.id)).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const second = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content: 'Tambah satu lagi pengeluaran makan Rp20.000 hari ini.',
          },
        });

        expect(await service.captureMessage(owner, second.id)).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const captures = await db.noteWork.findMany({
          where: { userId: owner, stage: 'capture' },
          orderBy: { createdAt: 'asc' },
          select: { payload: true, sourceRef: true },
        });

        expect(captures).toHaveLength(2);
        expect(captures.map((item) => item.sourceRef)).toEqual([
          first.id,
          second.id,
        ]);
        await processStages(service);
        expect(
          await db.noteWork.findMany({
            where: { userId: owner, stage: 'organize' },
            orderBy: { createdAt: 'asc' },
            select: {
              status: true,
              lastErrorCode: true,
              payload: true,
              result: true,
            },
          }),
        ).toMatchObject([
          {
            status: 'applied',
            lastErrorCode: null,
            payload: { question: null },
            result: {
              recordLines: expect.arrayContaining([
                expect.stringMatching(/20[.,]?000/),
              ]),
            },
          },
          {
            status: 'applied',
            lastErrorCode: null,
            payload: { question: null },
            result: {
              recordLines: expect.arrayContaining([
                expect.stringMatching(/20[.,]?000/),
              ]),
            },
          },
        ]);

        expect(
          (await daily.findByDate(owner, '2026-10-31'))?.text.match(
            /20[.,]?000/g,
          ),
        ).toHaveLength(2);
        const workspace = await notes.list(owner);
        expect(workspace.items).toHaveLength(1);
        expect((await notes.find(owner, workspace.items[0]!.id)).text).toMatch(
          /20[.,]?000[\s\S]*20[.,]?000/,
        );
        expect(
          await db.noteWork.count({
            where: { userId: owner, stage: 'organize', status: 'applied' },
          }),
        ).toBe(2);
        expect(
          await db.noteWork.count({
            where: { userId: owner, status: 'failed' },
          }),
        ).toBe(0);
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model asks before applying a correction with two plausible targets',
      async () => {
        await db.noteWork.deleteMany({ where: { userId: owner } });
        const prior = await db.message.update({
          where: { id: messageId },
          data: {
            content:
              'Pengeluaran hari ini: makan Rp20.000 dan transportasi Rp30.000.',
          },
        });

        const before = await daily.save(owner, {
          date: '2026-10-31',
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '2026-10-31: makan Rp20.000' }],
              },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '2026-10-31: transportasi Rp30.000' },
                ],
              },
            ],
          },
        });

        const correction = await db.message.create({
          data: {
            userId: owner,
            conversationId: prior.conversationId,
            role: 'user',
            content: 'Sebenarnya Rp65.000.',
          },
        });

        const service = organizer(
          'apply',
          new OpenRouterLanguageModel(new ConfigService(process.env)),
        );

        const receipt = await service.captureMessage(owner, correction.id);

        expect(receipt).toMatchObject({
          records: [expect.objectContaining({ status: 'needs_clarification' })],
        });
        expect((await daily.findByDate(owner, '2026-10-31'))?.content).toEqual(
          before?.content,
        );
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model creates a requested new note inside the confirmed folder',
      async () => {
        const folder = await notes.create(owner, {
          kind: 'folder',
          title: 'Keuangan',
          requestKey: 'live-explicit-folder',
        });

        const competing = await notes.create(owner, {
          kind: 'note',
          title: 'Pengeluaran',
          requestKey: 'live-competing-tracker',
        });

        const conversation = await db.conversation.create({
          data: { userId: owner },
        });

        const message = await db.message.create({
          data: {
            userId: owner,
            conversationId: conversation.id,
            role: 'user',
            content:
              'Catat total pengeluaran saya hari ini Rp55.000 dalam catatan Budget Baru di folder Keuangan.',
          },
        });

        const service = organizer(
          'apply',
          new OpenRouterLanguageModel(new ConfigService(process.env)),
        );

        expect(await service.captureMessage(owner, message.id)).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const workspace = await notes.list(owner);
        expect(workspace.items).toHaveLength(3);
        const requested = workspace.notes.find(
          (note) => note.title === 'Budget Baru',
        );

        expect(requested).toMatchObject({ parentId: folder.id });
        expect((await notes.find(owner, requested!.id)).text).toMatch(
          /55[.,]?000/,
        );
        expect((await notes.find(owner, competing.id)).text).toBe('');
        expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model organizes a new manual daily record without any conversation',
      async () => {
        await db.noteWork.deleteMany({ where: { userId: owner } });
        await db.conversation.deleteMany({ where: { userId: owner } });
        await daily.save(owner, {
          date: '2026-10-31',
          sourceType: 'dashboard',
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: '2026-10-31: Berat badan pagi ini 73 kg.',
                  },
                ],
              },
            ],
          },
        });
        const service = organizer(
          'apply',
          new OpenRouterLanguageModel(new ConfigService(process.env)),
        );

        await processStages(service);

        const workspace = await notes.list(owner);
        expect(workspace.items).toHaveLength(1);
        expect((await notes.find(owner, workspace.items[0]!.id)).text).toMatch(
          /73\s*kg/,
        );
        expect((await daily.findByDate(owner, '2026-10-31'))?.text).toMatch(
          /73\s*kg/,
        );
        expect(await db.conversation.count({ where: { userId: owner } })).toBe(
          0,
        );
        expect(
          await db.noteWork.count({
            where: { userId: owner, stage: 'organize', status: 'applied' },
          }),
        ).toBe(1);
        expect(
          await db.noteWork.count({
            where: { userId: owner, status: 'failed' },
          }),
        ).toBe(0);
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model reviews a changed daily note without reconstructing an already captured record',
      async () => {
        const service = organizer(
          'apply',
          new OpenRouterLanguageModel(new ConfigService(process.env)),
        );

        await processStages(service);
        const workspace = await notes.list(owner);
        const destination = await notes.find(owner, workspace.items[0]!.id);
        await notes.update(owner, destination.id, {
          revision: destination.revision,
          content: { type: 'doc', content: [] },
        });
        const day = await daily.findByDate(owner, '2026-10-31');
        if (!day) throw new Error('The source capture must exist.');

        await daily.save(owner, {
          date: '2026-10-31',
          sourceType: 'dashboard',
          expectedUpdatedAt: day.updatedAt,
          document: {
            type: 'doc',
            content: [
              ...day.content.content,
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Hari ini hujan.' }],
              },
            ],
          },
        });

        await processStages(service);

        expect({
          text: (await notes.find(owner, destination.id)).text,
          failed: (await work.history(owner)).filter(
            (item) => item.status === 'failed',
          ),
          dailySources: (await work.history(owner)).filter(
            (item) => item.sourceKind === 'daily',
          ),
        }).toMatchObject({ text: '', failed: [] });
        expect(
          await db.noteWork.count({
            where: { userId: owner, status: 'failed' },
          }),
        ).toBe(0);
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model replaces a resolved daily total rather than adding a second total',
      async () => {
        const model = new OpenRouterLanguageModel(
          new ConfigService(process.env),
        );

        const service = organizer('proposal', model);
        expect(await service.captureMessage(owner, messageId)).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        expect((await daily.findByDate(owner, '2026-10-31'))?.text).toMatch(
          /55[.,]?000/,
        );
        const original = await db.message.findUniqueOrThrow({
          where: { id: messageId },
        });

        const correction = await db.message.create({
          data: {
            userId: owner,
            conversationId: original.conversationId,
            role: 'user',
            content: 'Sebenarnya total pengeluaran saya hari ini Rp65.000.',
          },
        });

        const receipt = await service.captureMessage(owner, correction.id);

        expect(receipt).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const note = await daily.findByDate(owner, '2026-10-31');
        // A parenthetical correction history may retain the superseded amount.
        const currentText = note?.text.replace(/\([^)]*\)/g, '');

        expect(currentText).toMatch(/65[.,]?000/);
        expect(currentText).not.toMatch(/55[.,]?000/);
        expect(currentText).not.toMatch(/Rp\s*[\d.,]+[\s\S]*Rp\s*[\d.,]+/);
        expect((await notes.list(owner)).items).toEqual([]);
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model retains a daily total alongside an additional transaction without summing them',
      async () => {
        const model = new OpenRouterLanguageModel(
          new ConfigService(process.env),
        );

        const service = organizer('proposal', model);
        expect(await service.captureMessage(owner, messageId)).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        expect((await daily.findByDate(owner, '2026-10-31'))?.text).toMatch(
          /55[.,]?000/,
        );
        const original = await db.message.findUniqueOrThrow({
          where: { id: messageId },
        });

        const additional = await db.message.create({
          data: {
            userId: owner,
            conversationId: original.conversationId,
            role: 'user',
            content: 'Tambah pengeluaran makan Rp20.000 hari ini.',
          },
        });

        const receipt = await service.captureMessage(owner, additional.id);

        expect(
          (await work.history(owner, additional.id)).filter(
            (item) => item.status === 'failed',
          ),
        ).toEqual([]);
        expect(receipt).toMatchObject({
          records: [expect.objectContaining({ status: 'applied' })],
        });
        const note = await daily.findByDate(owner, '2026-10-31');
        expect(note?.text).toMatch(/55[.,]?000/);
        expect(note?.text).toMatch(/20[.,]?000/);
        expect(note?.text).not.toMatch(/75[.,]?000/);
      },
      180_000,
    );

    (process.env.NOTES_MODEL_EVAL_ENABLED === 'true' ? test : test.skip)(
      'live model proposes a dated expense tracker without changing notes (requires NOTES_MODEL_EVAL_ENABLED)',
      async () => {
        const model = new OpenRouterLanguageModel(
          new ConfigService(process.env),
        );

        await processStages(organizer('proposal', model));
        const source = await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'source' },
        });

        expect(source).toMatchObject({
          status: 'proposal',
          payload: {
            items: [
              expect.objectContaining({
                date: '2026-10-31',
              }),
            ],
          },
        });
        const planned = await db.noteWork.findFirstOrThrow({
          where: { userId: owner, stage: 'organize' },
        });

        expect(planned).toMatchObject({
          status: 'proposal',
          payload: {
            proposal: expect.objectContaining({
              document: expect.objectContaining({ type: 'doc' }),
            }),
          },
        });
        expect(JSON.stringify(planned.payload)).toContain('55.000');
        expect((await notes.list(owner)).items).toEqual([]);
        expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
      },
      180_000,
    );
  },
);
