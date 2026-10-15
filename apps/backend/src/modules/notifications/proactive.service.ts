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
import type { User } from '../../database/entities';
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
import { localeOf } from '../../shared/locale';
import { renderBriefingBody } from './notification-formatting';
import { CalendarReadService } from '../calendar/calendar-read.service';

const BRIEFING_MAX_OUTPUT_TOKENS = 400;
const BRIEFING_TEMPERATURE = 0.5;

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
    private readonly calendar: CalendarReadService,
    private readonly notifications: NotificationService,
    @Optional()
    @Inject(LANGUAGE_MODEL)
    private readonly model: LanguageModelGateway | null = null,
  ) {}

  async run(userId: string, now = new Date(), requestId?: string) {
    const user = await this.users.findById(userId);
    if (!user) return { status: 'skipped_user_missing' as const };
    const preferences = await this.preferences.getPreferences(userId);
    if (preferences?.briefingEnabled === false)
      return { status: 'skipped_disabled' as const };

    const window = dayWindow(now, user.timezone);
    const [todayTasks, overdueTasks, todayReminders, events] =
      await Promise.all([
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
        this.reminders.list(userId, {
          schedule: 'today',
          now,
          timezone: user.timezone,
        }),
        this.calendar.list(userId, window.start, window.end),
      ]);

    const snapshot: BriefingSnapshot = {
      date: window.date,
      timezone: user.timezone,
      instant: now.toISOString(),
      events: events.map((event) => {
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

        throw new Error(`Calendar event ${event.id} has no valid date shape.`);
      }),
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
      remindersToday: todayReminders
        .filter((reminder) => reminder.scheduledAt >= now)
        .map((reminder) => ({
          title: reminder.title,
          scheduledAt: reminder.scheduledAt.toISOString(),
        })),
    };

    const introduction = await this.compose(user, snapshot);
    const format = { locale: localeOf(user.locale), timezone: user.timezone };
    const contentByChannel = {
      telegram: renderBriefingBody(
        { ...format, rich: true },
        snapshot,
        introduction,
      ),
      whatsapp: renderBriefingBody(
        { ...format, rich: false },
        snapshot,
        introduction,
      ),
    };

    const result = await this.notifications.enqueue({
      userId,
      kind: 'daily_briefing',
      content: contentByChannel.telegram,
      contentByChannel,
      idempotencyKey: requestId
        ? `dev-briefing:${requestId}`
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
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    private readonly notifications: NotificationService,
    private readonly composer: NotificationComposerService,
  ) {}

  async run(userId: string, now = new Date(), requestId?: string) {
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
