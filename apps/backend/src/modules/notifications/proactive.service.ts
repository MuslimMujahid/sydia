import { Inject, Injectable } from '@nestjs/common';
import {
  CALENDAR_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type ICalendarRepository,
  type INotificationRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { dayWindow } from '../../shared/date-time';
import { NotificationService } from './notification.service';

function localTime(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

function dueNow(
  now: Date,
  timezone: string,
  configured: string | null,
): boolean {
  return localTime(now, timezone) === (configured ?? '08:00');
}

function itemLines(items: readonly { title: string }[]): string {
  return items.length
    ? items.map((item) => `- ${item.title}`).join('\n')
    : '- none';
}

@Injectable()
export class DailyBriefingService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendar: ICalendarRepository,
    private readonly notifications: NotificationService,
  ) {}

  async run(userId: string, now = new Date()) {
    const user = await this.users.findById(userId);
    if (!user) return { status: 'skipped_user_missing' as const };
    const preferences = await this.preferences.getPreferences(userId);
    if (!preferences?.briefingEnabled)
      return { status: 'skipped_disabled' as const };

    if (!dueNow(now, user.timezone, preferences.briefingTime)) {
      return { status: 'skipped_not_due' as const };
    }

    const window = dayWindow(now, user.timezone);
    const [todayTasks, overdueTasks, todayReminders, overdueReminders, events] =
      await Promise.all([
        this.tasks.list(userId, {
          status: ['inbox', 'doing'],
          due: 'today',
          now,
          timezone: user.timezone,
        }),
        this.tasks.list(userId, {
          status: ['inbox', 'doing'],
          due: 'overdue',
          now,
          timezone: user.timezone,
        }),
        this.reminders.list(userId, {
          status: 'scheduled',
          schedule: 'today',
          now,
          timezone: user.timezone,
        }),
        this.reminders.list(userId, {
          status: 'scheduled',
          schedule: 'past',
          now,
          timezone: user.timezone,
        }),
        this.calendar.list(userId, window.start, window.end),
      ]);

    const content = [
      `Daily briefing for ${window.date}`,
      `Agenda (${events.length}): ${events.length ? events.map((event) => event.title).join(', ') : 'none'}`,
      `Tasks due today (${todayTasks.length}):\n${itemLines(todayTasks)}`,
      `Overdue tasks (${overdueTasks.length}):\n${itemLines(overdueTasks)}`,
      `Reminders today (${todayReminders.length}):\n${itemLines(todayReminders)}`,
      `Overdue reminders (${overdueReminders.length}):\n${itemLines(overdueReminders)}`,
      'Reply with what you want to tackle first.',
    ].join('\n\n');

    const result = await this.notifications.enqueue({
      userId,
      kind: 'daily_briefing',
      content,
      idempotencyKey: `briefing:${window.date}`,
      proactive: true,
      sourceId: window.date,
    });

    return {
      status: result.policyOutcome === 'paused' ? 'skipped_paused' : 'queued',
      delivery: result.delivery,
      replayed: result.replayed,
      date: window.date,
    } as const;
  }
}

@Injectable()
export class FollowUpService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly notifications: NotificationService,
  ) {}

  async run(userId: string, now = new Date()) {
    const user = await this.users.findById(userId);
    if (!user)
      return { status: 'skipped_user_missing' as const, deliveries: [] };
    const preferences = await this.preferences.getPreferences(userId);

    if (preferences?.proactivePaused) {
      return { status: 'skipped_paused' as const, deliveries: [] };
    }

    const window = dayWindow(now, user.timezone);
    const [todayTasks, overdueTasks, todayReminders, overdueReminders] =
      await Promise.all([
        this.tasks.list(userId, {
          status: ['inbox', 'doing'],
          due: 'today',
          now,
          timezone: user.timezone,
        }),
        this.tasks.list(userId, {
          status: ['inbox', 'doing'],
          due: 'overdue',
          now,
          timezone: user.timezone,
        }),
        this.reminders.list(userId, {
          status: 'scheduled',
          schedule: 'today',
          now,
          timezone: user.timezone,
        }),
        this.reminders.list(userId, {
          status: 'scheduled',
          schedule: 'past',
          now,
          timezone: user.timezone,
        }),
      ]);

    const dueTasks = [
      ...overdueTasks,
      ...todayTasks.filter((task) => task.dueAt && task.dueAt <= now),
    ];

    const dueReminders = [
      ...overdueReminders,
      ...todayReminders.filter((reminder) => reminder.scheduledAt <= now),
    ];

    const deliveries = [];

    for (const task of dedupeById(dueTasks)) {
      deliveries.push(
        await this.notifications.enqueue({
          userId,
          kind: 'follow_up',
          content: `Follow-up: task "${task.title}" is still unfinished and due. Reply when you have completed it or want to reschedule it.`,
          idempotencyKey: `follow-up:${window.date}:task:${task.id}`,
          proactive: true,
          sourceId: task.id,
        }),
      );
    }

    for (const reminder of dedupeById(dueReminders)) {
      deliveries.push(
        await this.notifications.enqueue({
          userId,
          kind: 'follow_up',
          content: `Follow-up: reminder "${reminder.title}" is still pending. Reply when it is done or should be rescheduled.`,
          idempotencyKey: `follow-up:${window.date}:reminder:${reminder.id}`,
          proactive: true,
          sourceId: reminder.id,
        }),
      );
    }

    return {
      status: deliveries.length ? 'queued' : 'nothing_due',
      deliveries,
    } as const;
  }
}

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);

    return true;
  });
}
