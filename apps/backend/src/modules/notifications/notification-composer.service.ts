import { Inject, Injectable, Logger } from '@nestjs/common';
import { renderTemplate } from './notification-templates';
import { localeOf } from '../../shared/locale';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type ReminderDelivery,
} from '../../database/interfaces';
import type { Task, User, CalendarEvent } from '../../database/entities';
import { REMINDER_TEMPLATES } from './reminder.templates';
import {
  GOOGLE_MEET_FAILED_TEMPLATES,
  GOOGLE_MEET_READY_TEMPLATES,
  renderGoogleMeetTemplate,
} from './google-meet.templates';
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

  /** Reminder delivery text for one occurrence, rendered in the owner's locale. */
  async reminderBody(reminder: ReminderDelivery): Promise<string> {
    const user = await this.users.findById(reminder.userId);
    const locale = localeOf(user?.locale);

    return renderTemplate(REMINDER_TEMPLATES[locale], {
      locale,
      timezone: user?.timezone ?? 'UTC',
      title: reminder.title,
      notes: reminder.notes,
      time: reminder.scheduledAt,
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

  /**
   * The proactive line that settles the "I'll send it when it's ready" promise
   * made by the chat receipt, in the owner's locale.
   */
  async googleMeetOutcomeBody(
    userId: string,
    outcome: {
      title: string;
      status: 'success' | 'failure';
      googleMeetUrl: string | null;
    },
  ): Promise<string> {
    const user = await this.users.findById(userId);

    if (!user) {
      Logger.error(
        `Cannot compose a Google Meet update: user ${userId} is missing.`,
        NotificationComposerService.name,
      );
      throw new Error('Google Meet update owner is missing.');
    }

    const locale = localeOf(user.locale);
    // A success without a link cannot deliver on the promise; say so instead.
    const ready = outcome.status === 'success' && outcome.googleMeetUrl;

    return renderGoogleMeetTemplate(
      ready
        ? GOOGLE_MEET_READY_TEMPLATES[locale]
        : GOOGLE_MEET_FAILED_TEMPLATES[locale],
      { title: outcome.title, url: outcome.googleMeetUrl ?? '' },
    );
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
