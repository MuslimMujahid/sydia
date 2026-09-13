import { Inject, Injectable } from '@nestjs/common';
import type {
  NotificationTemplateContext,
  Random,
} from './notification-templates';
import {
  NOTIFICATION_RANDOM,
  renderNotificationMessage,
} from './notification-templates';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type ReminderDelivery,
} from '../../database/interfaces';
import type {
  Reminder,
  SupportedLocale,
  Task,
  User,
} from '../../database/entities';
import { REMINDER_TEMPLATES } from './reminder.templates';
import { FOLLOW_UP_TEMPLATES } from './follow-up.templates';

type CompositionUser = Pick<User, 'persona' | 'locale' | 'timezone'>;

function localeOf(locale: string | null | undefined): SupportedLocale {
  return locale === 'id' ? 'id' : 'en';
}

/**
 * Turns stored domain records into the message a user actually receives.
 *
 * A body is rendered exactly once per enqueue and then persisted on the
 * delivery record, so every channel for a given record shares one body instead
 * of each consumer drawing its own variant.
 */
@Injectable()
export class NotificationComposerService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_RANDOM) private readonly random: Random,
  ) {}

  /** Reminder delivery text for one occurrence, flavored by the owner's persona. */
  async reminderBody(reminder: ReminderDelivery): Promise<string> {
    const user = await this.users.findById(reminder.userId);

    return this.render(user, {
      title: reminder.title,
      notes: reminder.notes,
      time: reminder.scheduledAt,
    });
  }

  followUpTaskBody(user: CompositionUser, task: Task): string {
    return this.render(user, {
      title: task.title,
      notes: task.description,
      time: task.dueAt,
      kind: 'task',
    });
  }

  followUpReminderBody(user: CompositionUser, reminder: Reminder): string {
    return this.render(user, {
      title: reminder.title,
      notes: reminder.notes,
      time: reminder.scheduledAt,
      kind: 'reminder',
    });
  }

  private render(
    user: CompositionUser | null,
    input: {
      title: string;
      notes?: string | null;
      time?: Date | null;
      kind?: NotificationTemplateContext['kind'];
    },
  ): string {
    const locale = localeOf(user?.locale);

    return renderNotificationMessage(
      input.kind ? FOLLOW_UP_TEMPLATES : REMINDER_TEMPLATES,
      {
        persona: user?.persona ?? 'professional',
        locale,
        timezone: user?.timezone ?? 'UTC',
        title: input.title,
        notes: input.notes,
        time: input.time,
        kind: input.kind,
      },
      this.random,
    );
  }
}
