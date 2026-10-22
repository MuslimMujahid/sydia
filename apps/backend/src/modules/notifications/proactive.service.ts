import { BillingAccessService } from '../billing';
import { followUpIntervalKey } from './follow-up-interval';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type INotificationRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
} from '../../database/interfaces';
import type { User, Reminder } from '../../database/entities';
import { dayWindow, nextOccurrence } from '../../shared/date-time';
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
import { localeOf } from '../../shared/locale';
import { renderScheduledBriefing } from './scheduled-briefing-formatting';
import { briefingDayWindows, isWeeklyBriefingDay } from './briefing-schedule';
import { CalendarReadService } from '../calendar/calendar-read.service';

const BRIEFING_MAX_OUTPUT_TOKENS = 400;
const BRIEFING_TEMPERATURE = 0.5;
type BriefingMode = 'scheduled' | 'daily' | 'weekly' | 'daily_weekly';
const MANUAL_BRIEFING_KEYS: Record<BriefingMode, string> = {
  scheduled: 'dev-briefing',
  daily: 'dev-briefing',
  weekly: 'dev-weekly-briefing',
  daily_weekly: 'dev-combined-briefing',
};

// Daily is the most frequent supported reminder recurrence. Allow timezone
// transitions at either end while bounding malformed-rule expansion.
const MAX_WEEKLY_REMINDER_OCCURRENCES = 14;

function reminderOccurrences(reminder: Reminder, end: Date): Reminder[] {
  const occurrences: Reminder[] = [];
  let at: Date | null = reminder.scheduledAt;

  while (at && at < end) {
    if (occurrences.length >= MAX_WEEKLY_REMINDER_OCCURRENCES)
      throw new Error(
        `Reminder ${reminder.id} exceeded the weekly occurrence limit.`,
      );
    occurrences.push({ ...reminder, scheduledAt: at });
    const next: Date | null = reminder.recurrence
      ? nextOccurrence(reminder.recurrence, at, reminder.timezone)
      : null;

    if (next && next <= at)
      throw new Error(`Reminder ${reminder.id} recurrence did not advance.`);
    at = next;
  }

  return occurrences;
}

@Injectable()
export class DailyBriefingService {
  private readonly logger = new Logger(DailyBriefingService.name);

  constructor(
    private readonly billing: BillingAccessService,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly calendar: CalendarReadService,
    private readonly notifications: NotificationService,
    @Optional()
    @Inject(LANGUAGE_MODEL)
    private readonly model: LanguageModelGateway | null = null,
  ) {}

  async run(
    userId: string,
    now = new Date(),
    requestId?: string,
    mode: BriefingMode = 'scheduled',
  ) {
    if (!(await this.billing.isActive(userId)))
      return { status: 'skipped_inactive' as const };
    const user = await this.users.findById(userId);
    if (!user) return { status: 'skipped_user_missing' as const };
    const preferences = await this.preferences.getPreferences(userId);
    const dailyEnabled = preferences?.briefingEnabled !== false;
    const weeklyEnabled = preferences?.weeklyBriefingEnabled !== false;
    const weekly =
      mode === 'weekly' ||
      mode === 'daily_weekly' ||
      (mode === 'scheduled' &&
        weeklyEnabled &&
        isWeeklyBriefingDay(
          now,
          user.timezone,
          preferences?.weeklyBriefingDay ?? 1,
        ));

    const enabled =
      mode === 'weekly'
        ? weeklyEnabled
        : mode === 'daily_weekly'
          ? dailyEnabled && weeklyEnabled
          : mode === 'daily'
            ? dailyEnabled
            : dailyEnabled || weekly;

    if (!enabled) return { status: 'skipped_disabled' as const };

    const window = dayWindow(now, user.timezone);
    const days = weekly ? briefingDayWindows(now, user.timezone) : [window];
    const end = days[days.length - 1]!.end;
    const [dueTasks, overdueTasks, scheduledReminders, events] =
      await Promise.all([
        this.tasks.list(userId, {
          status: ['inbox'],
          ...(weekly
            ? { dueRange: { from: window.start, to: end } }
            : { due: 'today' as const }),
          now,
          timezone: user.timezone,
        }),
        this.tasks.list(userId, {
          status: ['inbox'],
          due: 'overdue',
          now,
          timezone: user.timezone,
        }),
        this.reminders.list(userId, {
          ...(weekly
            ? { scheduleRange: { from: now, to: end } }
            : { schedule: 'today' as const }),
          now,
          timezone: user.timezone,
        }),
        this.calendar.list(userId, window.start, end),
      ]);

    // Assign an overlapping event to its first day in the window. Multi-day
    // events retain their full date range and appear only once in the message.
    const eventDays = events.map((event) => {
      if (event.status === 'cancelled') return -1;

      if (event.allDayStartDate && event.allDayEndDate) {
        const from = event.allDayStartDate.toISOString().slice(0, 10);
        const to = event.allDayEndDate.toISOString().slice(0, 10);

        return days.findIndex((day) => from <= day.date && to > day.date);
      }

      if (event.startAt && event.endAt)
        return days.findIndex(
          (day) => event.startAt! < day.end && event.endAt! > day.start,
        );
      throw new Error(`Calendar event ${event.id} has no valid date shape.`);
    });

    const reminderDates = weekly
      ? scheduledReminders
          .filter((reminder) => reminder.scheduledAt >= now)
          .flatMap((reminder) => reminderOccurrences(reminder, end))
          .sort(
            (left, right) =>
              left.scheduledAt.getTime() - right.scheduledAt.getTime(),
          )
      : scheduledReminders;

    const snapshots: BriefingSnapshot[] = days.map((day, index) => ({
      date: day.date,
      timezone: user.timezone,
      instant: (index === 0 ? now : day.start).toISOString(),
      events: events
        .filter((_event, eventIndex) => eventDays[eventIndex] === index)
        .map((event) => {
          if (event.allDayStartDate && event.allDayEndDate)
            return {
              title: event.title,
              kind: 'all_day' as const,
              startDate: event.allDayStartDate.toISOString().slice(0, 10),
              endDate: event.allDayEndDate.toISOString().slice(0, 10),
            };
          if (event.startAt && event.endAt)
            return {
              title: event.title,
              kind: 'timed' as const,
              startAt: event.startAt.toISOString(),
              endAt: event.endAt.toISOString(),
            };

          throw new Error(
            `Calendar event ${event.id} has no valid date shape.`,
          );
        }),
      tasksDueToday: dueTasks
        .filter(
          (task) =>
            task.dueAt && task.dueAt >= day.start && task.dueAt < day.end,
        )
        .map((task) => ({
          title: task.title,
          priority: task.priority,
          dueAt: task.dueAt?.toISOString() ?? null,
        })),
      overdueTasks: (index === 0 ? overdueTasks : []).map((task) => ({
        title: task.title,
        priority: task.priority,
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
      remindersToday: reminderDates
        .filter(
          (reminder) =>
            reminder.scheduledAt >= now &&
            reminder.scheduledAt >= day.start &&
            reminder.scheduledAt < day.end,
        )
        .map((reminder) => ({
          title: reminder.title,
          scheduledAt: reminder.scheduledAt.toISOString(),
        })),
    }));

    const snapshot = snapshots[0]!;
    const introduction = await this.compose(user, snapshot);
    const format = { locale: localeOf(user.locale), timezone: user.timezone };
    const upcoming = weekly ? snapshots.slice(1) : null;
    const telegram = renderScheduledBriefing(
      { ...format, rich: true },
      snapshot,
      upcoming,
      introduction,
      mode === 'weekly' ? 'weekly' : 'combined',
    );

    const whatsapp = renderScheduledBriefing(
      { ...format, rich: false },
      snapshot,
      upcoming,
      introduction,
      mode === 'weekly' ? 'weekly' : 'combined',
    );

    if (telegram.omitted > 0 || whatsapp.omitted > 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'briefing_items_omitted',
          userId,
          date: window.date,
          telegram: telegram.omitted,
          whatsapp: whatsapp.omitted,
        }),
      );
    }

    const contentByChannel = {
      telegram: telegram.content,
      whatsapp: whatsapp.content,
    };

    const result = await this.notifications.enqueue({
      userId,
      kind: weekly ? 'weekly_briefing' : 'daily_briefing',
      content: contentByChannel.telegram,
      contentByChannel,
      idempotencyKey: requestId
        ? `${MANUAL_BRIEFING_KEYS[mode]}:${requestId}`
        : `briefing:${window.date}`,
      proactive: true,
      sourceId: window.date,
    });

    return {
      status: result.policyOutcome,
      deliveries: result.deliveries,
      replayed: result.replayed,
      date: window.date,
    } as const;
  }

  /**
   * Generate the persona introduction once. Degraded mode uses a localized
   * introduction while retaining the same complete, formatted record lists.
   */
  private async compose(
    user: Pick<
      User,
      'id' | 'name' | 'locale' | 'timezone' | 'persona' | 'preferredAddress'
    >,
    snapshot: BriefingSnapshot,
  ): Promise<string> {
    if (!this.model) {
      this.logger.warn(
        'Briefing model is unconfigured; using deterministic introduction.',
      );

      return this.fallback(user, snapshot);
    }

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

      const introduction = result.text.trim();
      if (introduction) return introduction;
      this.logger.warn(
        'Briefing model returned empty text; using deterministic introduction.',
      );

      return this.fallback(user, snapshot);
    } catch (error) {
      this.logger.warn(
        `Briefing generation failed, using the deterministic briefing: ${error instanceof Error ? error.message : String(error)}`,
      );

      return this.fallback(user, snapshot);
    }
  }

  private fallback(
    user: Pick<User, 'locale'>,
    snapshot: BriefingSnapshot,
  ): string {
    const empty =
      snapshot.events.length +
        snapshot.tasksDueToday.length +
        snapshot.overdueTasks.length +
        snapshot.remindersToday.length ===
      0;

    if (localeOf(user.locale) === 'id')
      return empty
        ? 'Hari ini belum ada agenda, tugas jatuh tempo, atau pengingat.'
        : `Ringkasan harian untuk ${snapshot.date}.`;

    return empty
      ? 'No agenda, tasks due, or reminders today.'
      : `Daily briefing for ${snapshot.date}.`;
  }
}

@Injectable()
export class FollowUpService {
  constructor(
    private readonly billing: BillingAccessService,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    private readonly notifications: NotificationService,
    private readonly composer: NotificationComposerService,
  ) {}

  async run(userId: string, now = new Date(), requestId?: string) {
    if (!(await this.billing.isActive(userId)))
      return { status: 'skipped_inactive' as const };
    const user = await this.users.findById(userId);
    if (!user)
      return { status: 'skipped_user_missing' as const, deliveries: [] };

    const preferences = await this.notifications.getPreferences(userId);
    // Users without a preference row use the same default as settings and DB.
    const intervalKey = followUpIntervalKey(
      now,
      user.timezone,
      preferences?.followUpIntervalMinutes ?? 60,
    );

    const [todayTasks, overdueTasks] = await Promise.all([
      this.tasks.list(userId, {
        status: ['inbox'],
        due: 'today',
        now,
        timezone: user.timezone,
      }),
      this.tasks.list(userId, {
        status: ['inbox'],
        due: 'overdue',
        now,
        timezone: user.timezone,
      }),
    ]);

    const dueTasks = dedupeById([
      ...overdueTasks,
      ...todayTasks.filter((task) => task.dueAt && task.dueAt <= now),
    ]);

    if (dueTasks.length === 0)
      return { status: 'nothing_due' as const, deliveries: [] };

    const contentByChannel = this.composer.followUpTasksBodies(user, dueTasks);
    const result = await this.notifications.enqueue({
      userId,
      kind: 'follow_up',
      content: contentByChannel.telegram,
      contentByChannel,
      idempotencyKey: requestId
        ? `dev-follow-up:${requestId}`
        : `follow-up:${intervalKey}`,
      proactive: true,
      sourceId: intervalKey,
    });

    const deliveries = result.deliveries;

    return {
      status: result.policyOutcome,
      deliveries,
      replayed: result.replayed,
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
