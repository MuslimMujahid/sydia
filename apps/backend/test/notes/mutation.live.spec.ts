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
  PrismaNotePresenceRepository,
  PrismaNoteWorkRepository,
  PrismaDailyNoteRepository,
  PrismaUserRepository,
} from '../../src/database/repositories';
import { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';
import { NoteMutationService } from '../../src/modules/notes/note-mutation.service';

const enabled = process.env.NOTES_CONTRACT_ENABLED === 'true';
(enabled ? describe : describe.skip)('Durable protected note mutations', () => {
  const owner = `mutation-${randomUUID()}`;
  const ref = 'daily:2026-10-31';
  let db: PrismaService;
  let presence: PrismaNotePresenceRepository;
  let mutations: NoteMutationService;
  let daily: DailyNoteService;
  let messageId: string;
  beforeAll(async () => {
    const config = new ConfigService({
      BACKEND_DB_URL: process.env.BACKEND_DB_URL,
      BACKEND_MODEL_API_KEY: '',
    });

    db = new PrismaService(config);
    await db.user.create({
      data: {
        id: owner,
        name: 'Mutation contract',
        email: `${owner}@test.invalid`,
        timezone: 'Asia/Makassar',
      },
    });
    const conversation = await db.conversation.create({
      data: { userId: owner },
    });

    const message = await db.message.create({
      data: {
        conversationId: conversation.id,
        userId: owner,
        role: 'user',
        content: 'Pengeluaran saya hari ini Rp55.000',
      },
    });

    messageId = message.id;
    presence = new PrismaNotePresenceRepository(db);
    mutations = new NoteMutationService(
      presence,
      new PrismaNoteWorkRepository(db),
    );
    const queue = {
      dailyNoteIndexes: { add: () => Promise.resolve({ id: 'test-index' }) },
    } as unknown as QueueService;

    daily = new DailyNoteService(
      new PrismaDailyNoteRepository(db),
      new PrismaUserRepository(db),
      new EmbeddingsService(config),
      queue,
    );
  });
  beforeEach(async () => {
    await db.noteWork.deleteMany({ where: { userId: owner } });
    await db.noteEditorPresence.deleteMany({ where: { userId: owner } });
    await db.dailyNote.deleteMany({ where: { userId: owner } });
  });
  afterAll(async () => {
    await db.user.delete({ where: { id: owner } });
    await db.onModuleDestroy();
  });

  function input() {
    return {
      userId: owner,
      sourceMessageId: messageId,
      key: 'capture-expense',
      tool: 'write_daily_note',
      arguments: { text: 'Rp55.000' },
      destinationRef: ref,
      refs: () => Promise.resolve([ref]),
    };
  }

  test('a manual daily-note source supports protected mutations without a fabricated message', async () => {
    await daily.save(owner, {
      date: '2026-10-31',
      sourceType: 'dashboard',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Berat badan 73 kg.' }],
          },
        ],
      },
    });
    const work = new PrismaNoteWorkRepository(db);
    await work.collectSources(100, 0, owner);
    const source = await db.noteWork.findFirstOrThrow({
      where: { userId: owner, sourceKind: 'daily', stage: 'source' },
    });

    const apply = () =>
      mutations.execute(
        {
          ...input(),
          sourceMessageId: '',
          sourceWork: source,
          key: 'manual-day:organize-weight',
        },
        () => Promise.resolve({ written: true, ref: 'custom:weight' }),
      );

    expect(await apply()).toEqual({ written: true, ref: 'custom:weight' });
    expect(await apply()).toEqual({ written: true, ref: 'custom:weight' });
    expect(
      await db.noteWork.findFirstOrThrow({
        where: { userId: owner, key: 'manual-day:organize-weight' },
      }),
    ).toMatchObject({
      sourceKind: 'daily',
      sourceRef: '2026-10-31',
      sourceVersion: source.sourceVersion,
      status: 'applied',
      attempts: 1,
    });
  });

  test('background source authority cannot be borrowed from another owner', async () => {
    const work = new PrismaNoteWorkRepository(db);
    const source = await work.acceptMessage({
      userId: owner,
      sourceMessageId: messageId,
      key: 'foreign-owner-guard-source',
      stage: 'source',
      payload: {},
    });

    let mutated = false;

    await expect(
      mutations.execute(
        { ...input(), sourceWork: { ...source, userId: 'different-owner' } },
        () => {
          mutated = true;

          return Promise.resolve({ written: true });
        },
      ),
    ).rejects.toThrow('owner-scoped source evidence');
    expect(mutated).toBe(false);
    expect(
      await db.noteWork.count({ where: { userId: owner, stage: 'tool' } }),
    ).toBe(0);
  });

  test('background operation identity cannot replay different mutation arguments', async () => {
    const work = new PrismaNoteWorkRepository(db);
    const source = await work.acceptMessage({
      userId: owner,
      sourceMessageId: messageId,
      key: 'source-operation-guard',
      stage: 'source',
      payload: {},
    });

    await mutations.execute({ ...input(), sourceWork: source }, () =>
      Promise.resolve({ written: true }),
    );
    let changed = false;

    await expect(
      mutations.execute(
        {
          ...input(),
          sourceWork: source,
          arguments: { text: 'Different content' },
        },
        () => {
          changed = true;

          return Promise.resolve({ written: true });
        },
      ),
    ).rejects.toThrow('different mutation');
    expect(changed).toBe(false);
    expect(
      await db.noteWork.count({
        where: { userId: owner, stage: 'tool', status: 'applied' },
      }),
    ).toBe(1);
  });

  async function append() {
    const note = await daily.append(owner, {
      date: '2026-10-31',
      text: 'Pengeluaran total Rp55.000',
      sourceMessageId: messageId,
    });

    return { noteId: note.id };
  }

  test('an open editor preserves pending work without changing the note', async () => {
    await presence.acquire(owner, ref, 'editor-a');
    const result = await mutations.execute(input(), append);
    expect(result).toMatchObject({
      status: 'deferred',
      saved: false,
      reason: 'note_open',
    });
    expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
    const work = await db.noteWork.findFirstOrThrow({
      where: { userId: owner },
    });

    expect(work).toMatchObject({
      status: 'deferred',
      sourceContent: 'Pengeluaran saya hari ini Rp55.000',
      timezone: 'Asia/Makassar',
    });
  });
  test('replaying a committed mutation returns its receipt without duplicating content', async () => {
    const first = await mutations.execute(input(), append);
    const replay = await mutations.execute(input(), append);
    expect(replay).toEqual(first);
    expect((await daily.findByDate(owner, '2026-10-31'))?.text).toBe(
      'Pengeluaran total Rp55.000',
    );
    expect(
      await db.noteWork.count({ where: { userId: owner, status: 'applied' } }),
    ).toBe(1);
  });
  test('a failure after the note write rolls back the note and retains failed work', async () => {
    await expect(
      mutations.execute(input(), async () => {
        await append();
        throw new Error('simulated crash before receipt');
      }),
    ).rejects.toThrow('simulated crash');
    expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
    expect(
      await db.noteWork.findFirstOrThrow({ where: { userId: owner } }),
    ).toMatchObject({ status: 'failed', lastErrorCode: 'mutation_failed' });
  });
  test('closing the final editor permits a fresh mutation of deferred work', async () => {
    await presence.acquire(owner, ref, 'editor-a');
    await mutations.execute(input(), append);
    await presence.release(owner, ref, 'editor-a');
    await mutations.execute(input(), append);
    expect((await daily.findByDate(owner, '2026-10-31'))?.text).toBe(
      'Pengeluaran total Rp55.000',
    );
    expect(
      await db.noteWork.findFirstOrThrow({ where: { userId: owner } }),
    ).toMatchObject({ status: 'applied' });
  });

  test('a failed presence database connection retains work without executing the mutation', async () => {
    let mutated = false;

    await expect(
      mutations.execute(
        {
          ...input(),
          refs: async () => {
            const [connection] = await db.client.$queryRaw<
              Array<{ pid: number }>
            >`
              SELECT pg_backend_pid() AS pid
            `;

            if (!connection)
              throw new Error('The guarded connection is missing.');

            // Terminate only this test's guarded connection, using another pool connection.
            const [termination] = await db.$queryRaw<
              Array<{ terminated: boolean }>
            >`
              SELECT pg_terminate_backend(${connection.pid}) AS terminated
            `;

            expect(termination?.terminated).toBe(true);

            return [ref];
          },
        },
        async () => {
          mutated = true;

          return append();
        },
      ),
    ).rejects.toThrow();

    expect(mutated).toBe(false);
    expect(await daily.findByDate(owner, '2026-10-31')).toBeNull();
    expect(
      await db.noteWork.findFirstOrThrow({ where: { userId: owner } }),
    ).toMatchObject({ status: 'failed', lastErrorCode: 'mutation_failed' });
  });
});
