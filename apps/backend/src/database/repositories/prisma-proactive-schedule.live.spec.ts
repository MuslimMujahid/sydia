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
import { PrismaService } from '../../infra/prisma';
import { PrismaNotificationRepository } from './prisma-notification.repository';
import { PrismaTaskRepository } from './prisma-task.repository';

/**
 * Briefing and task follow-up due-index contracts against PostgreSQL: the
 * triggers that mark users per lane and the repository that reads and clears
 * the marks (docs/REMINDER_DUE_INDEX_PLAN.md). Opt in with
 * PROACTIVE_SCHEDULE_CONTRACT_ENABLED=true; fixtures use unique ids and are
 * removed afterwards. Run under scripts/test-lock.sh.
 */
const enabled = process.env.PROACTIVE_SCHEDULE_CONTRACT_ENABLED === 'true';
const now = new Date('2026-11-21T02:00:00.000Z');

(enabled ? describe : describe.skip)('Proactive schedule due index', () => {
  let db: PrismaService;
  let notifications: PrismaNotificationRepository;
  let tasks: PrismaTaskRepository;
  let userId: string;

  const marks = async (lane: string) =>
    (
      await db.proactiveScheduleChange.findMany({
        where: { userId, lane },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(({ id }) => id.toString());

  const clearMarks = () =>
    db.proactiveScheduleChange.deleteMany({ where: { userId } });

  const listed = async (lane: 'briefing' | 'follow_up', at = now) =>
    (await notifications.listProactiveWork(lane, at, null, 1000)).find(
      (item) => item.userId === userId,
    );

  beforeAll(async () => {
    db = new PrismaService(new ConfigService(process.env));
    await db.$connect();
    notifications = new PrismaNotificationRepository(db);
    tasks = new PrismaTaskRepository(db);
  });

  beforeEach(async () => {
    userId = `proactive-contract-${randomUUID()}`;
    await db.user.create({
      data: {
        id: userId,
        name: 'Proactive contract',
        email: `${userId}@example.test`,
        emailVerified: true,
        timezone: 'Asia/Jakarta',
        locale: 'id',
      },
    });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: userId } });
    await clearMarks();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  test('a new account is marked in both lanes', async () => {
    expect(await marks('briefing')).toHaveLength(1);
    expect(await marks('follow_up')).toHaveLength(1);
  });

  test('notification preferences mark both lanes; a pause marks follow-ups only', async () => {
    await clearMarks();
    await db.userPreference.create({
      data: { userId, briefingTime: '07:30', followUpIntervalMinutes: 120 },
    });
    expect(await marks('briefing')).toHaveLength(1);
    expect(await marks('follow_up')).toHaveLength(1);

    await clearMarks();
    await db.assistancePreference.create({
      data: { userId, pausedAll: true },
    });
    expect(await marks('briefing')).toHaveLength(0);
    expect(await marks('follow_up')).toHaveLength(1);
  });

  test('only timezone and ban changes on the account mark it', async () => {
    await clearMarks();
    await db.user.update({ where: { id: userId }, data: { name: 'Renamed' } });
    expect(await marks('briefing')).toHaveLength(0);

    await db.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Makassar' },
    });
    await db.user.update({ where: { id: userId }, data: { banned: true } });
    expect(await marks('briefing')).toHaveLength(2);
    expect(await marks('follow_up')).toHaveLength(2);
  });

  test('task writes and user messages mark follow-ups; assistant messages do not', async () => {
    await clearMarks();
    const task = await db.task.create({
      data: { userId, title: 'Bayar SPP', dueAt: now },
      select: { id: true },
    });

    await db.task.update({ where: { id: task.id }, data: { status: 'done' } });
    expect(await marks('follow_up')).toHaveLength(2);
    expect(await marks('briefing')).toHaveLength(0);

    await clearMarks();
    const conversation = await db.conversation.create({
      data: { userId, channel: 'web' },
      select: { id: true },
    });

    await db.message.create({
      data: {
        userId,
        conversationId: conversation.id,
        role: 'assistant',
        content: 'Halo',
      },
    });
    expect(await marks('follow_up')).toHaveLength(0);

    await db.message.create({
      data: {
        userId,
        conversationId: conversation.id,
        role: 'user',
        content: 'Sudah dibayar',
      },
    });
    expect(await marks('follow_up')).toHaveLength(1);
  });

  test('lists marked users with defaults and clears only the marks it read', async () => {
    const work = await listed('briefing');
    expect(work).toMatchObject({
      userId,
      timezone: 'Asia/Jakarta',
      banned: false,
      briefingEnabled: true,
      briefingTime: null,
      followUpIntervalMinutes: 60,
      notifiable: true,
      changeIds: await marks('briefing'),
    });

    // A change committed after the read must survive completion.
    await db.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Makassar' },
    });
    const later = (await marks('briefing')).at(-1)!;
    const dueAt = new Date('2026-11-22T00:00:00.000Z');
    await notifications.completeProactiveWork(
      'briefing',
      userId,
      work!.changeIds,
      dueAt,
    );

    expect(await marks('briefing')).toEqual([later]);
    // The follow-up lane is untouched.
    expect(await marks('follow_up')).toHaveLength(2);
    expect(
      await db.proactiveSchedule.findUnique({
        where: { userId_lane: { userId, lane: 'briefing' } },
      }),
    ).toMatchObject({ dueAt });
  });

  test('a stored due time lists the user only once it has passed', async () => {
    await clearMarks();
    await notifications.completeProactiveWork(
      'follow_up',
      userId,
      [],
      new Date('2026-11-21T03:00:00.000Z'),
    );

    expect(await listed('follow_up')).toBeUndefined();
    expect(
      await listed('follow_up', new Date('2026-11-21T03:00:00.000Z')),
    ).toBeDefined();
    expect(await listed('briefing')).toBeUndefined();

    await notifications.completeProactiveWork('follow_up', userId, [], null);
    expect(await db.proactiveSchedule.count({ where: { userId } })).toBe(0);
  });

  test('finds the earliest open task due time', async () => {
    expect(await tasks.earliestInboxDueAt(userId)).toBeNull();
    await db.task.createMany({
      data: [
        { userId, title: 'Later', dueAt: new Date('2026-11-23T02:00:00Z') },
        { userId, title: 'Done', dueAt: now, status: 'done' },
        { userId, title: 'Sooner', dueAt: new Date('2026-11-22T02:00:00Z') },
        { userId, title: 'No date' },
      ],
    });

    expect(await tasks.earliestInboxDueAt(userId)).toEqual(
      new Date('2026-11-22T02:00:00Z'),
    );
  });

  test('deleting an account leaves no schedule and its marks are discarded', async () => {
    await notifications.completeProactiveWork('briefing', userId, [], now);
    await db.user.delete({ where: { id: userId } });

    expect(await db.proactiveSchedule.count({ where: { userId } })).toBe(0);
    expect(await marks('follow_up')).not.toHaveLength(0);
    expect(await notifications.discardOrphanProactiveChanges()).toBeGreaterThan(
      0,
    );
    expect(await marks('follow_up')).toHaveLength(0);
  });
});
