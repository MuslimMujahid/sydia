import { Inject, Injectable, Logger } from '@nestjs/common';
import { renderTemplate } from './notification-templates';
import { localeOf } from '../../shared/locale';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type ReminderDelivery,
} from '../../database/interfaces';
import type { Task, User, CalendarEvent } from '../../database/entities';
import {
  IMPORTANT_REMINDER_TEMPLATES,
  REMINDER_FINAL_TEMPLATES,
  REMINDER_REPEAT_SUFFIX,
  REMINDER_TEMPLATES,
} from './reminder.templates';
import {
  notificationTaskRow,
  type NotificationBodies,
} from './notification-formatting';

type CompositionUser = Pick<User, 'locale' | 'timezone'>;

/**
 * Turns stored domain records into the message a user actually receives.
 *
 * Compact rows are rendered for each channel before persistence.
 * Retries retain the stored body.
 */
@Injectable()
export class NotificationComposerService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  /**
   * Reminder delivery text for one occurrence, rendered in the owner's locale.
   * Important reminders use their own template; `sequence` ≥ 2 marks a repeat.
   */
  async reminderBody(
    reminder: ReminderDelivery,
    options: { occurrenceAt?: Date; sequence?: number } = {},
  ): Promise<string> {
    const user = await this.users.findById(reminder.userId);
    const locale = localeOf(user?.locale);
    const sequence = options.sequence ?? 1;
    const title =
      reminder.important && sequence > 1
        ? `${reminder.title}${REMINDER_REPEAT_SUFFIX[locale].replace('{n}', String(sequence))}`
        : reminder.title;

    return renderTemplate(
      reminder.important
        ? IMPORTANT_REMINDER_TEMPLATES[locale]
        : REMINDER_TEMPLATES[locale],
      {
        locale,
        timezone: user?.timezone ?? 'UTC',
        title,
        notes: reminder.notes,
        time: options.occurrenceAt ?? reminder.scheduledAt,
      },
    );
  }

  /** The single note sent when an important reminder reaches its repeat cap. */
  async reminderFinalBody(reminder: ReminderDelivery): Promise<string> {
    const user = await this.users.findById(reminder.userId);
    const locale = localeOf(user?.locale);

    return renderTemplate(REMINDER_FINAL_TEMPLATES[locale], {
      locale,
      timezone: user?.timezone ?? 'UTC',
      title: reminder.title,
    });
  }

  async eventReminderBody(
    userId: string,
    event: CalendarEvent,
    startAt: Date,
  ): Promise<string> {
    const user = await this.users.findById(userId);

    if (!user) {
      Logger.error(
        `Cannot compose event reminder: user ${userId} is missing.`,
        NotificationComposerService.name,
      );
      throw new Error('Event reminder owner is missing.');
    }

    const locale = localeOf(user.locale);

    return renderTemplate(REMINDER_TEMPLATES[locale], {
      locale,
      timezone: event.timezone ?? user.timezone,
      title: event.title,
      time: startAt,
      notes:
        [event.location, event.googleMeetUrl].filter(Boolean).join('\n') ||
        null,
    });
  }

  followUpTasksBodies(
    user: CompositionUser,
    tasks: readonly Task[],
  ): NotificationBodies {
    const locale = localeOf(user.locale);
    const introduction =
      locale === 'id'
        ? `Tugas yang perlu ditindaklanjuti (${tasks.length}).`
        : `Tasks needing follow-up (${tasks.length}).`;

    const render = (rich: boolean) =>
      `${introduction}\n\n${tasks
        .map((task) =>
          notificationTaskRow({ locale, timezone: user.timezone, rich }, task),
        )
        .join('\n')}`;

    return { telegram: render(true), whatsapp: render(false) };
  }
}
