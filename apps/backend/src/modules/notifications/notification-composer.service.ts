import { Inject, Injectable } from '@nestjs/common';
import { renderTemplate } from './notification-templates';
import { localeOf } from '../../shared/locale';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type ReminderDelivery,
} from '../../database/interfaces';
import type { Task, User } from '../../database/entities';
import { REMINDER_TEMPLATES } from './reminder.templates';
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
