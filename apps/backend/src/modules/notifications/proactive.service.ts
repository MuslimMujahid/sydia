import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import type { SupportedLocale, User } from '../../database/entities';
import { dayWindow } from '../../shared/date-time';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
} from '../../infra/model-gateway';
import {
  buildBriefingMessages,
  loadPersonaPrompt,
  type BriefingSnapshot,
} from './briefing-prompt';
import { NotificationComposerService } from './notification-composer.service';
import { NotificationService } from './notification.service';

const BRIEFING_MAX_OUTPUT_TOKENS = 400;
const BRIEFING_TEMPERATURE = 0.5;

function localeOf(locale: string | null | undefined): SupportedLocale {
  return locale === 'id' ? 'id' : 'en';
}

function itemLines(items: readonly { title: string }[]): string {
  return items.length
    ? items.map((item) => `- ${item.title}`).join('\n')
    : '- none';
}

@Injectable()
export class DailyBriefingService {
  private readonly logger = new Logger(DailyBriefingService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    @Inject(CALENDAR_REPOSITORY) private readonly calendar: ICalendarRepository,
    private readonly notifications: NotificationService,
    @Optional()
    @Inject(LANGUAGE_MODEL)
    private readonly model: LanguageModelGateway | null = null,
  ) {}

  async run(userId: string, now = new Date()) {
    const user = await this.users.findById(userId);
    if (!user) return { status: 'skipped_user_missing' as const };
    const preferences = await this.preferences.getPreferences(userId);
    if (preferences?.briefingEnabled === false)
      return { status: 'skipped_disabled' as const };

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

    const snapshot: BriefingSnapshot = {
      date: window.date,
      timezone: user.timezone,
      instant: now.toISOString(),
      events: events.map((event) => ({
        title: event.title,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
      })),
      tasksDueToday: todayTasks.map((task) => ({
        title: task.title,
        priority: task.priority,
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
      overdueTasks: overdueTasks.map((task) => ({
        title: task.title,
        priority: task.priority,
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
      remindersToday: todayReminders.map((reminder) => ({
        title: reminder.title,
        scheduledAt: reminder.scheduledAt.toISOString(),
      })),
      overdueReminders: overdueReminders.map((reminder) => ({
        title: reminder.title,
        scheduledAt: reminder.scheduledAt.toISOString(),
      })),
    };

    const content = await this.compose(user, snapshot);

    const result = await this.notifications.enqueue({
      userId,
      kind: 'daily_briefing',
      content,
      idempotencyKey: `briefing:${window.date}`,
      proactive: true,
      sourceId: window.date,
    });

    return {
      status: 'queued',
      deliveries: result.deliveries,
      replayed: result.replayed,
      date: window.date,
    } as const;
  }

  /**
   * Model first, template second. The deterministic version is not a degraded
   * mode to avoid: when the provider is unconfigured, slow, or returns nothing
   * usable, a correct plain briefing still reaches the user.
   */
  private async compose(
    user: Pick<
      User,
      'id' | 'name' | 'locale' | 'timezone' | 'persona' | 'preferredAddress'
    >,
    snapshot: BriefingSnapshot,
  ): Promise<string> {
    if (!this.model) return this.fallback(snapshot);

    try {
      const result = await this.model.generate({
        userId: user.id,
        messages: buildBriefingMessages({
          locale: localeOf(user.locale),
          address: user.preferredAddress,
          personaPrompt: loadPersonaPrompt(user.persona),
          snapshot,
        }),
        temperature: BRIEFING_TEMPERATURE,
        maxOutputTokens: BRIEFING_MAX_OUTPUT_TOKENS,
      });

      return result.text.trim() || this.fallback(snapshot);
    } catch (error) {
      this.logger.warn(
        `Briefing generation failed, using the deterministic briefing: ${error instanceof Error ? error.message : String(error)}`,
      );

      return this.fallback(snapshot);
    }
  }

  private fallback(snapshot: BriefingSnapshot): string {
    const lines = (items: readonly { title: string }[]) => itemLines(items);

    return [
      `Daily briefing for ${snapshot.date}`,
      `Agenda (${snapshot.events.length}): ${snapshot.events.length ? snapshot.events.map((event) => event.title).join(', ') : 'none'}`,
      `Tasks due today (${snapshot.tasksDueToday.length}):\n${lines(snapshot.tasksDueToday)}`,
      `Overdue tasks (${snapshot.overdueTasks.length}):\n${lines(snapshot.overdueTasks)}`,
      `Reminders today (${snapshot.remindersToday.length}):\n${lines(snapshot.remindersToday)}`,
      `Overdue reminders (${snapshot.overdueReminders.length}):\n${lines(snapshot.overdueReminders)}`,
      'Reply with what you want to tackle first.',
    ].join('\n\n');
  }
}

@Injectable()
export class FollowUpService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly notifications: NotificationService,
    private readonly composer: NotificationComposerService,
  ) {}

  async run(userId: string, now = new Date()) {
    const user = await this.users.findById(userId);
    if (!user)
      return { status: 'skipped_user_missing' as const, deliveries: [] };

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
          content: this.composer.followUpTaskBody(user, task),
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
          content: this.composer.followUpReminderBody(user, reminder),
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
