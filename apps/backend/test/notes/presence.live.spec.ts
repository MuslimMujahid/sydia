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
import { PrismaNotePresenceRepository } from '../../src/database/repositories';

const enabled = process.env.NOTES_CONTRACT_ENABLED === 'true';

function latch<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });

  return { promise, resolve };
}

async function waitForBlockedConnection(
  prisma: PrismaService,
  blocker: number,
) {
  const deadline = Date.now() + 3000;

  while (Date.now() < deadline) {
    const [result] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE ${blocker} = ANY(pg_blocking_pids(pid))
      ) AS waiting
    `;

    if (result?.waiting) return;
  }

  throw new Error(
    'The editor acquisition did not wait for the in-flight write.',
  );
}

(enabled ? describe : describe.skip)(
  'Editor presence PostgreSQL arbitration',
  () => {
    const owner = `presence-${randomUUID()}`;
    const ref = 'daily:2026-10-31';
    let prisma: PrismaService;
    let repository: PrismaNotePresenceRepository;
    beforeAll(async () => {
      prisma = new PrismaService(
        new ConfigService({ BACKEND_DB_URL: process.env.BACKEND_DB_URL }),
      );
      repository = new PrismaNotePresenceRepository(prisma);
      await prisma.user.create({
        data: {
          id: owner,
          name: 'Presence contract',
          email: `${owner}@test.invalid`,
        },
      });
    });
    beforeEach(async () => {
      await prisma.noteEditorPresence.deleteMany({ where: { userId: owner } });
    });
    afterAll(async () => {
      await prisma.user.delete({ where: { id: owner } });
      await prisma.onModuleDestroy();
    });
    test('an open empty daily date defers a write without executing it', async () => {
      await repository.acquire(owner, ref, 'editor-a');
      let writes = 0;
      const result = await repository.write(owner, [ref], () => {
        writes += 1;

        return Promise.resolve('written');
      });

      expect(result).toEqual({ status: 'deferred', reason: 'note_open' });
      expect(writes).toBe(0);
    });
    test('closing one editor leaves the other editor protected', async () => {
      await repository.acquire(owner, ref, 'editor-a');
      await repository.acquire(owner, ref, 'editor-b');
      await repository.release(owner, ref, 'editor-a');
      const result = await repository.write(owner, [ref], () =>
        Promise.resolve('written'),
      );

      expect(result.status).toBe('deferred');
    });
    test('closing the last editor allows a mutation', async () => {
      await repository.acquire(owner, ref, 'editor-a');
      await repository.release(owner, ref, 'editor-a');
      const result = await repository.write(owner, [ref], () =>
        Promise.resolve('written'),
      );

      expect(result).toEqual({ status: 'completed', value: 'written' });
    });
    test('an unrelated note remains writable', async () => {
      await repository.acquire(owner, ref, 'editor-a');
      const result = await repository.write(owner, ['custom:another'], () =>
        Promise.resolve('written'),
      );

      expect(result).toEqual({ status: 'completed', value: 'written' });
    });
    test('abandoned expired presence does not block forever', async () => {
      await repository.acquire(owner, ref, 'editor-a');
      await prisma.noteEditorPresence.updateMany({
        where: { userId: owner },
        data: { expiresAt: new Date('2000-01-01') },
      });
      const result = await repository.write(owner, [ref], () =>
        Promise.resolve('written'),
      );

      expect(result.status).toBe('completed');
    });
    test('renewal refreshes an expired registration', async () => {
      await repository.acquire(owner, ref, 'editor-a');
      await prisma.noteEditorPresence.updateMany({
        where: { userId: owner },
        data: { expiresAt: new Date('2000-01-01') },
      });
      await repository.acquire(owner, ref, 'editor-a');
      const result = await repository.write(owner, [ref], () =>
        Promise.resolve('written'),
      );

      expect(result.status).toBe('deferred');
    });
    test('mutation failures propagate instead of reporting completion', async () => {
      await expect(
        repository.write(owner, [ref], () =>
          Promise.reject(new Error('mutation failed')),
        ),
      ).rejects.toThrow('mutation failed');
    });

    test('an editor opening during a mutation waits for its committed result', async () => {
      const entered = latch<number>();
      const finish = latch<void>();
      const events: string[] = [];
      const writing = repository.write(owner, [ref], async () => {
        const [connection] = await prisma.client.$queryRaw<
          Array<{ pid: number }>
        >`
          SELECT pg_backend_pid() AS pid
        `;

        if (!connection) throw new Error('Writer connection is missing.');

        entered.resolve(connection.pid);
        await finish.promise;
        await prisma.client.user.update({
          where: { id: owner },
          data: { name: 'Committed before editor opened' },
        });
        events.push('written');

        return 'written';
      });

      const writerPid = await entered.promise;
      const opening = repository
        .acquire(owner, ref, 'concurrent-editor')
        .then(async () => {
          const user = await prisma.user.findUniqueOrThrow({
            where: { id: owner },
          });

          events.push(user.name);
        });

      try {
        await waitForBlockedConnection(prisma, writerPid);
        expect(events).toEqual([]);
      } finally {
        finish.resolve(undefined);
        await Promise.all([writing, opening]);
      }

      expect(events).toEqual(['written', 'Committed before editor opened']);
      expect(
        await repository.write(owner, [ref], () =>
          Promise.resolve('another write'),
        ),
      ).toEqual({
        status: 'deferred',
        reason: 'note_open',
      });
    });
  },
);
