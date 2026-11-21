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
import { TokenCipher } from '../../infra/crypto';
import { PrismaService } from '../../infra/prisma';
import { PrismaCalendarRepository } from './prisma-calendar.repository';

/**
 * Event reminder due-index contracts against PostgreSQL: the triggers that
 * mark changed calendars and the repository that reads and clears the marks
 * (docs/REMINDER_DUE_INDEX_PLAN.md). Opt in with
 * EVENT_REMINDER_CONTRACT_ENABLED=true; fixtures use unique ids and are
 * removed afterwards. Run under scripts/test-lock.sh.
 */
const enabled = process.env.EVENT_REMINDER_CONTRACT_ENABLED === 'true';
const now = new Date('2026-11-21T02:00:00.000Z');

(enabled ? describe : describe.skip)('Event reminder due index', () => {
  let db: PrismaService;
  let calendars: PrismaCalendarRepository;
  let userId: string;

  const marks = async () =>
    (
      await db.eventReminderChange.findMany({
        where: { userId },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(({ id }) => id.toString());

  const clearMarks = () =>
    db.eventReminderChange.deleteMany({ where: { userId } });

  const createEvent = () =>
    db.calendarEvent.create({
      data: {
        userId,
        title: 'Rapat sekolah',
        startAt: new Date('2026-11-21T09:00:00.000Z'),
        endAt: new Date('2026-11-21T10:00:00.000Z'),
        timezone: 'Asia/Jakarta',
        reminderMinutes: 30,
      },
      select: { id: true },
    });

  beforeAll(async () => {
    const config = new ConfigService(process.env);
    db = new PrismaService(config);
    await db.$connect();
    calendars = new PrismaCalendarRepository(db, new TokenCipher(config));
  });

  beforeEach(async () => {
    userId = `event-reminder-contract-${randomUUID()}`;
    await db.user.create({
      data: {
        id: userId,
        name: 'Event reminder contract',
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

  test('creating, editing and deleting an event each mark its owner', async () => {
    const { id } = await createEvent();
    expect(await marks()).toHaveLength(1);

    await db.calendarEvent.update({
      where: { id },
      data: { reminderMinutes: 10 },
    });
    expect(await marks()).toHaveLength(2);

    await db.calendarEvent.delete({ where: { id } });
    expect(await marks()).toHaveLength(3);
  });

  test('a batch write marks its owner once per statement', async () => {
    await db.calendarEvent.createMany({
      data: [1, 2, 3].map((hour) => ({
        userId,
        title: `Event ${hour}`,
        startAt: new Date(`2026-11-21T0${hour}:00:00.000Z`),
        endAt: new Date(`2026-11-21T0${hour}:30:00.000Z`),
        reminderMinutes: 10,
      })),
    });

    expect(await marks()).toHaveLength(1);
  });

  test('only a timezone change on the account marks the owner', async () => {
    await db.user.update({ where: { id: userId }, data: { name: 'Renamed' } });
    expect(await marks()).toHaveLength(0);

    await db.user.update({
      where: { id: userId },
      data: { timezone: 'Asia/Makassar' },
    });
    expect(await marks()).toHaveLength(1);
  });

  test('Google link changes and binding deletes mark the owner', async () => {
    const integration = await db.calendarIntegration.create({
      data: { userId },
      select: { id: true },
    });

    const binding = await db.calendarBinding.create({
      data: {
        integrationId: integration.id,
        googleSubject: 'subject',
        calendarId: 'primary',
        calendarName: 'Utama',
        timezone: 'Asia/Jakarta',
      },
      select: { id: true },
    });

    // Sync bookkeeping on the binding or integration does not mark the owner.
    await db.calendarBinding.update({
      where: { id: binding.id },
      data: { syncToken: 'token' },
    });
    await db.calendarIntegration.update({
      where: { id: integration.id },
      data: { status: 'connected' },
    });
    expect(await marks()).toHaveLength(0);

    await db.calendarEventLink.create({
      data: { bindingId: binding.id, googleEventId: 'google-1' },
    });
    expect(await marks()).toHaveLength(1);

    await db.calendarEventLink.updateMany({
      where: { bindingId: binding.id },
      data: { tombstoneAt: now },
    });
    expect(await marks()).toHaveLength(2);

    await clearMarks();
    await db.calendarBinding.delete({ where: { id: binding.id } });
    expect(await marks()).not.toHaveLength(0);
  });

  test('lists marked users with exactly the marks it read and clears only those', async () => {
    await createEvent();
    const [work] = (
      await calendars.listEventReminderWork(now, null, 1000)
    ).filter((item) => item.userId === userId);

    expect(work).toEqual({
      userId,
      timezone: 'Asia/Jakarta',
      changeIds: await marks(),
    });

    // A change committed after the read must survive completion.
    await createEvent();
    const later = (await marks()).at(-1)!;
    const dueAt = new Date('2026-11-21T08:27:00.000Z');
    await calendars.completeEventReminderWork(userId, work!.changeIds, dueAt);

    expect(await marks()).toEqual([later]);
    expect(
      await db.eventReminderSchedule.findUnique({ where: { userId } }),
    ).toMatchObject({ dueAt });
  });

  test('a stored due time lists the user only once it has passed', async () => {
    await calendars.completeEventReminderWork(
      userId,
      [],
      new Date('2026-11-21T03:00:00.000Z'),
    );
    const listed = async (at: Date) =>
      (await calendars.listEventReminderWork(at, null, 1000)).some(
        (item) => item.userId === userId,
      );

    expect(await listed(now)).toBe(false);
    expect(await listed(new Date('2026-11-21T03:00:00.000Z'))).toBe(true);

    await calendars.completeEventReminderWork(userId, [], null);
    expect(await db.eventReminderSchedule.count({ where: { userId } })).toBe(0);
  });

  test('reports reminder events and pending marks', async () => {
    expect(await calendars.hasEventReminders(userId)).toBe(false);
    expect(await calendars.hasPendingEventReminderChange(userId)).toBe(false);

    const { id } = await createEvent();
    expect(await calendars.hasEventReminders(userId)).toBe(true);
    expect(await calendars.hasPendingEventReminderChange(userId)).toBe(true);

    await db.calendarEvent.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    expect(await calendars.hasEventReminders(userId)).toBe(false);
  });

  test('deleting an account leaves no schedule and its marks are discarded', async () => {
    await createEvent();
    await calendars.completeEventReminderWork(userId, [], now);
    await db.user.delete({ where: { id: userId } });

    expect(await db.eventReminderSchedule.count({ where: { userId } })).toBe(0);
    expect(await marks()).not.toHaveLength(0);
    expect(await calendars.discardOrphanEventReminderChanges()).toBeGreaterThan(
      0,
    );
    expect(await marks()).toHaveLength(0);
  });
});
