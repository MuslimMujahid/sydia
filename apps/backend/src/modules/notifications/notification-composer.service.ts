import { Inject, Injectable } from '@nestjs/common';
import type { Random } from './notification-templates';
import {
  NOTIFICATION_RANDOM,
  TASK_PRIORITY_LABELS,
  formatNotificationTime,
  renderNotificationMessage,
  renderTemplate,
} from './notification-templates';
import { localeOf } from '../../shared/locale';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type ReminderDelivery,
} from '../../database/interfaces';
import type { Task, User } from '../../database/entities';
import { REMINDER_TEMPLATES } from './reminder.templates';
import { FOLLOW_UP_TEMPLATES } from './follow-up.templates';

type CompositionUser = Pick<User, 'persona' | 'locale' | 'timezone'>;

/**
 * Turns stored domain records into the message a user actually receives.
 *
A body is rendered exactly once per enqueue and then persisted on the
delivery record, so every channel for a given notification shares one body
instead of each consumer drawing its own variant.
 */
@Injectable()
export class NotificationComposerService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_RANDOM) private readonly random: Random,
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

  followUpTasksBody(user: CompositionUser, tasks: readonly Task[]): string {
    const locale = localeOf(user.locale);
    const items = tasks
      .map((task) => {
        const segments = [task.title];

        if (task.dueAt) {
          segments.push(
            `⏰ ${formatNotificationTime(task.dueAt, user.timezone, locale)}`,
          );
        }

        segments.push(TASK_PRIORITY_LABELS[locale][task.priority]);

        return `- ${segments.join(' | ')}`;
      })
      .join('\n');

    return renderNotificationMessage(
      FOLLOW_UP_TEMPLATES,
      {
        persona: user.persona,
        locale,
        timezone: user.timezone,
        items,
      },
      this.random,
    );
  }
}
