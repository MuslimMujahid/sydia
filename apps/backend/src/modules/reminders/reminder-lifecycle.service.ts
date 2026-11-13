import { Inject, Injectable } from '@nestjs/common';
import {
  REMINDER_REPOSITORY,
  type IReminderRepository,
  type ReminderOccurrenceDetail,
} from '../../database/interfaces';
import {
  SNOOZABLE_OCCURRENCE_STATUSES,
  type Reminder,
  type ReminderWrite,
} from '../../database/entities';
import { ReminderSchedulerService } from './reminder-scheduler.service';

export const MIN_SNOOZE_MS = 60_000;

export type ReminderActionErrorCode =
  'not_found' | 'not_dispatched' | 'too_soon' | 'needs_confirmation';

const ERROR_MESSAGES: Record<ReminderActionErrorCode, string> = {
  not_found: 'The specified reminder was not found.',
  not_dispatched:
    'This reminder has not fired yet, so it cannot be snoozed. Reschedule it with update_reminder instead.',
  too_soon: 'A snooze must be at least 1 minute from now.',
  needs_confirmation:
    'This snooze reaches or passes the next occurrence of the recurring reminder. Ask the user to confirm, then retry with confirmPastNextOccurrence true.',
};

export class ReminderActionError extends Error {
  constructor(readonly code: ReminderActionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ReminderActionError';
  }
}

export type ReminderTarget = { occurrenceId?: string; reminderId?: string };

/**
 * Acknowledgement, snooze, and the repeat side effects of editing a reminder.
 * Snoozing never moves the original: it marks the fired occurrence snoozed and
 * creates a one-time copy at the new time (specs/008).
 */
@Injectable()
export class ReminderLifecycleService {
  constructor(
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly scheduler: ReminderSchedulerService,
  ) {}

  async snooze(
    userId: string,
    input: ReminderTarget & {
      until: Date;
      confirmPastNextOccurrence?: boolean;
      source: { type: 'chat' | 'dashboard'; messageId?: string | null };
    },
    now = new Date(),
  ): Promise<{ reminder: Reminder; snoozed: ReminderOccurrenceDetail }> {
    const occurrence = await this.dispatchedOccurrence(userId, input);
    const original = await this.reminders.findById(
      userId,
      occurrence.reminderId,
    );

    if (!original) throw new ReminderActionError('not_found');
    if (input.until.getTime() - now.getTime() < MIN_SNOOZE_MS)
      throw new ReminderActionError('too_soon');
    if (
      original.recurrence &&
      original.scheduledAt > occurrence.occurrenceAt &&
      input.until >= original.scheduledAt &&
      !input.confirmPastNextOccurrence
    )
      throw new ReminderActionError('needs_confirmation');

    const copy: ReminderWrite = {
      title: original.title,
      notes: original.notes,
      scheduledAt: input.until,
      timezone: original.timezone,
      recurrence: null,
      important: original.important,
      repeatIntervalMinutes: original.repeatIntervalMinutes,
      sourceType: input.source.type,
      sourceMessageId: input.source.messageId ?? null,
    };

    const reminder = await this.reminders.createSnoozeCopy(
      userId,
      occurrence.id,
      SNOOZABLE_OCCURRENCE_STATUSES,
      copy,
    );

    if (!reminder) throw new ReminderActionError('not_found');
    await this.scheduler.cancelOccurrenceFollowUps(occurrence.id);
    await this.scheduler.schedule(reminder);

    return {
      reminder,
      snoozed: (await this.reminders.findOccurrence(userId, occurrence.id)) ?? {
        ...occurrence,
        status: 'snoozed',
      },
    };
  }

  /** Acknowledges awaiting occurrences; an empty result means none was awaiting. */
  async acknowledge(
    userId: string,
    input: ReminderTarget,
    now = new Date(),
  ): Promise<ReminderOccurrenceDetail[]> {
    if (!input.occurrenceId && !input.reminderId)
      throw new ReminderActionError('not_found');

    const targets = input.occurrenceId
      ? [input.occurrenceId]
      : (await this.reminders.listAwaitingAcknowledgement(userId))
          .filter(({ reminderId }) => reminderId === input.reminderId)
          .map(({ id }) => id);

    if (input.occurrenceId) {
      const occurrence = await this.reminders.findOccurrence(
        userId,
        input.occurrenceId,
      );

      if (!occurrence) throw new ReminderActionError('not_found');
    } else if (!(await this.reminders.findById(userId, input.reminderId!)))
      throw new ReminderActionError('not_found');

    const acknowledged: ReminderOccurrenceDetail[] = [];

    for (const id of targets) {
      const occurrence = await this.reminders.acknowledge(userId, id, now);
      if (!occurrence) continue;
      await this.scheduler.cancelOccurrenceFollowUps(id);
      acknowledged.push(occurrence);
    }

    return acknowledged;
  }

  /**
   * Re-arms an edited reminder. Rescheduling or switching to regular stops the
   * current acknowledgement cycle; a new interval applies from the next repeat.
   */
  async afterUpdate(
    userId: string,
    before: Reminder,
    after: Reminder,
  ): Promise<void> {
    const rescheduled =
      after.scheduledAt.getTime() !== before.scheduledAt.getTime();

    if (rescheduled || (before.important && !after.important))
      await this.scheduler.stopRepeats(after.id);
    else if (
      after.important &&
      after.repeatIntervalMinutes !== before.repeatIntervalMinutes
    )
      await this.scheduler.retimeRepeats(userId, after);

    await this.scheduler.schedule(after);
  }

  private async dispatchedOccurrence(
    userId: string,
    target: ReminderTarget,
  ): Promise<ReminderOccurrenceDetail> {
    if (target.occurrenceId) {
      const occurrence = await this.reminders.findOccurrence(
        userId,
        target.occurrenceId,
      );

      if (!occurrence) throw new ReminderActionError('not_found');
      if (occurrence.status === 'pending')
        throw new ReminderActionError('not_dispatched');

      return occurrence;
    }

    if (!target.reminderId) throw new ReminderActionError('not_found');
    const occurrence = await this.reminders.findLatestDispatchedOccurrence(
      userId,
      target.reminderId,
    );

    if (occurrence) return occurrence;
    throw new ReminderActionError(
      (await this.reminders.findById(userId, target.reminderId))
        ? 'not_dispatched'
        : 'not_found',
    );
  }
}
