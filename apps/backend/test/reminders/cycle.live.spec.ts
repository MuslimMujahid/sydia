import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { PrismaService } from '../../src/infra/prisma';
import { QueueService, type ReminderJob } from '../../src/infra/queue';
import {
  PrismaReminderRepository,
  PrismaUserRepository,
} from '../../src/database/repositories';
import { NotificationComposerService } from '../../src/modules/notifications/notification-composer.service';
import type { NotificationIntent } from '../../src/modules/notifications/notification.service';
import { processReminderJob } from '../../src/modules/reminders/reminder-job.processor';
import { ReminderLifecycleService } from '../../src/modules/reminders/reminder-lifecycle.service';
import { ReminderSchedulerService } from '../../src/modules/reminders/reminder-scheduler.service';

/**
 * Important-reminder cycle through real BullMQ (loopback Redis db 15) and
 * PostgreSQL (specs/007, 008). Channel sending is recorded instead of sent.
 * Opt in with REMINDER_CONTRACT_ENABLED=true and run under scripts/test-lock.sh.
 */
const enabled = process.env.REMINDER_CONTRACT_ENABLED === 'true';

async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting; last value ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

(enabled ? describe : describe.skip)(
  'Important reminder cycle through BullMQ and PostgreSQL',
  () => {
    let db: PrismaService;
    let queues: QueueService;
    let worker: Worker<ReminderJob>;
    let reminders: PrismaReminderRepository;
    let scheduler: ReminderSchedulerService;
    let lifecycle: ReminderLifecycleService;
    const sent: NotificationIntent[] = [];
    let userId: string;

    beforeAll(async () => {
      const url = new URL(process.env.BACKEND_REDIS_URL!);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new Error('Reminder cycle contract requires loopback Redis.');
      url.pathname = '/15';
      db = new PrismaService(new ConfigService(process.env));
      await db.$connect();
      queues = new QueueService(
        new ConfigService({ BACKEND_REDIS_URL: url.toString() }),
      );
      await queues.reminders.obliterate({ force: true });
      reminders = new PrismaReminderRepository(db);
      const users = new PrismaUserRepository(db);
      scheduler = new ReminderSchedulerService(reminders, users, queues);
      lifecycle = new ReminderLifecycleService(reminders, scheduler);
      const composer = new NotificationComposerService(users);
      worker = new Worker<ReminderJob>(
        'reminders',
        (job) =>
          processReminderJob(
            {
              reminders,
              queues,
              composer,
              notifications: {
                enqueue: (input) => {
                  sent.push(input);

                  return Promise.resolve({
                    deliveries: [],
                    replayed: false,
                    policyOutcome: 'queued',
                  });
                },
              },
            },
            job.data,
          ),
        { connection: { url: url.toString() } },
      );
    });

    beforeEach(async () => {
      sent.length = 0;
      userId = `reminder-cycle-${randomUUID()}`;
      await db.user.create({
        data: {
          id: userId,
          name: 'Reminder cycle',
          email: `${userId}@example.test`,
          emailVerified: true,
          timezone: 'Asia/Jakarta',
          locale: 'id',
        },
      });
    });

    afterEach(async () => {
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await worker.close();
      await queues.reminders.obliterate({ force: true });
      await queues.onModuleDestroy();
      await db.$disconnect();
    });

    async function important(intervalMinutes: number) {
      const reminder = await reminders.create(userId, {
        title: 'Minum obat',
        scheduledAt: new Date(),
        timezone: 'Asia/Jakarta',
        important: true,
        repeatIntervalMinutes: 5,
      });

      // The API floor is 5 minutes; 0 lets the full cycle run in seconds.
      await db.reminder.update({
        where: { id: reminder.id },
        data: { repeatIntervalMinutes: intervalMinutes },
      });
      await scheduler.schedule(reminder);

      const occurrence = await until(
        () => reminders.findLatestDispatchedOccurrence(userId, reminder.id),
        (value) => value !== null,
      );

      return { reminder, occurrenceId: occurrence!.id };
    }

    const pendingFollowUps = async (occurrenceId: string) =>
      (await queues.reminders.getJobs(['delayed', 'waiting'])).filter(
        ({ data }) =>
          data.kind !== 'dispatch' && data.occurrenceId === occurrenceId,
      );

    test('an unacknowledged reminder sends ten messages, then one final note, then expires', async () => {
      const { occurrenceId } = await important(0);
      const occurrence = await until(
        () => reminders.findOccurrence(userId, occurrenceId),
        (value) => value?.status === 'expired',
      );

      await until(
        () => Promise.resolve(sent.length),
        (count) => count === 11,
      );

      expect(occurrence?.messagesSent).toBe(10);
      expect(sent.map(({ kind }) => kind)).toEqual([
        'reminder',
        ...Array.from({ length: 9 }, () => 'reminder_repeat'),
        'reminder_final',
      ]);
      expect(
        sent[0]?.content.startsWith('⏰⏰⏰ Pengingat penting - Minum obat'),
      ).toBe(true);
      expect(sent[3]?.content).toContain('Minum obat (pengingat ke-4)');
      expect(sent[10]?.content).toBe(
        "Aku berhenti mengingatkan 'Minum obat'. Balas 'ingatkan X lagi' kalau masih perlu.",
      );
      expect(
        new Set(sent.map(({ idempotencyKey }) => idempotencyKey)).size,
      ).toBe(11);
    });

    test('acknowledging removes the pending repeat and nothing more is sent', async () => {
      const { reminder, occurrenceId } = await important(5);
      expect(await pendingFollowUps(occurrenceId)).toHaveLength(1);

      const acknowledged = await lifecycle.acknowledge(userId, {
        reminderId: reminder.id,
      });

      expect(acknowledged.map(({ id }) => id)).toEqual([occurrenceId]);
      expect(await pendingFollowUps(occurrenceId)).toEqual([]);
      expect(
        (await reminders.findOccurrence(userId, occurrenceId))?.status,
      ).toBe('acknowledged');
      expect(sent.map(({ kind }) => kind)).toEqual(['reminder']);
    });

    test('snoozing stops the repeats and queues an important one-time copy', async () => {
      const { occurrenceId } = await important(5);
      const untilAt = new Date(Date.now() + 15 * 60_000);
      const { reminder: copy } = await lifecycle.snooze(userId, {
        occurrenceId,
        until: untilAt,
        source: { type: 'chat' },
      });

      expect(await pendingFollowUps(occurrenceId)).toEqual([]);
      expect(copy).toMatchObject({
        important: true,
        recurrence: null,
        snoozedFrom: { occurrenceId },
      });
      const queued = (await queues.reminders.getJobs(['delayed'])).filter(
        ({ data }) => data.reminderId === copy.id,
      );

      expect(queued).toHaveLength(1);
      expect(queued[0]!.timestamp + queued[0]!.delay).toBeGreaterThanOrEqual(
        untilAt.getTime() - 1_000,
      );
    });

    test('a new interval re-times the pending repeat', async () => {
      const { reminder, occurrenceId } = await important(5);
      const before = await reminders.findById(userId, reminder.id);
      const after = await reminders.update(userId, reminder.id, {
        repeatIntervalMinutes: 15,
      });

      await lifecycle.afterUpdate(userId, before!, after!);

      const [job] = await pendingFollowUps(occurrenceId);
      const occurrence = await reminders.findOccurrence(userId, occurrenceId);
      expect(job?.data).toMatchObject({ kind: 'repeat', sequence: 2 });
      expect(job!.timestamp + job!.delay).toBeGreaterThanOrEqual(
        occurrence!.lastSentAt!.getTime() + 15 * 60_000 - 1_000,
      );
    });
  },
);
