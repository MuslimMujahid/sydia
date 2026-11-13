import { Inject, Injectable } from '@nestjs/common';
import {
  REMINDER_REPOSITORY,
  USER_REPOSITORY,
  type IReminderRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { REMINDER_MESSAGE_CAP, type Reminder } from '../../database/entities';
import { QueueService } from '../../infra/queue';
import {
  cancelFollowUps,
  reminderJobId,
  scheduleFollowUp,
} from './reminder-follow-ups';

@Injectable()
export class ReminderSchedulerService {
  constructor(
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly queue: QueueService,
  ) {}

  async timezoneFor(userId: string): Promise<string> {
    return (await this.users.findById(userId))?.timezone ?? 'Asia/Jakarta';
  }

  /**
   * (Re)arms the dispatch job for the reminder's current `scheduledAt`.
   * Repeats of an occurrence already awaiting acknowledgement are left alone;
   * callers stop them explicitly with `stopRepeats`.
   */
  async schedule(reminder: Reminder): Promise<void> {
    await this.cancelDispatch(reminder.id);
    const occurrence = await this.reminders.createOccurrence(
      reminder.id,
      reminder.scheduledAt,
    );

    // Editing metadata must not replay an occurrence already dispatched.
    if (occurrence.status !== 'pending') return;

    const jobId = reminderJobId(occurrence.idempotencyKey);
    const existingJob = await this.queue.reminders.getJob(jobId);

    if (
      existingJob &&
      ['completed', 'failed'].includes(await existingJob.getState())
    ) {
      await existingJob.remove();
    }

    await this.queue.reminders.add(
      'dispatch',
      {
        reminderId: reminder.id,
        idempotencyKey: occurrence.idempotencyKey,
        occurrenceId: occurrence.id,
      },
      {
        jobId,
        delay: Math.max(0, reminder.scheduledAt.getTime() - Date.now()),
      },
    );
  }

  /** Removes every pending job of the reminder, repeats included. */
  async cancel(reminderId: string): Promise<void> {
    const jobs = await this.queue.reminders.getJobs(['delayed', 'waiting']);
    await Promise.all(
      jobs
        .filter((job) => job.data.reminderId === reminderId)
        .map((job) => job.remove()),
    );
  }

  /** Stops the reminder's acknowledgement cycle: no further repeats or final note. */
  async stopRepeats(reminderId: string): Promise<void> {
    await this.reminders.cancelAwaiting(reminderId);
    await cancelFollowUps(this.queue.reminders, { reminderId });
  }

  /** Removes the pending repeat or final job of one occurrence. */
  async cancelOccurrenceFollowUps(occurrenceId: string): Promise<void> {
    await cancelFollowUps(this.queue.reminders, { occurrenceId });
  }

  /**
   * Applies a changed interval from the next repeat onward: the pending
   * follow-up is re-timed to `lastSentAt + interval`, or sent now if overdue.
   */
  async retimeRepeats(userId: string, reminder: Reminder): Promise<void> {
    const awaiting = (
      await this.reminders.listAwaitingAcknowledgement(userId)
    ).filter((occurrence) => occurrence.reminderId === reminder.id);

    for (const occurrence of awaiting) {
      const removed = await cancelFollowUps(this.queue.reminders, {
        occurrenceId: occurrence.id,
      });

      const next =
        removed[0] ??
        (occurrence.messagesSent < REMINDER_MESSAGE_CAP
          ? {
              kind: 'repeat' as const,
              reminderId: reminder.id,
              occurrenceId: occurrence.id,
              sequence: occurrence.messagesSent + 1,
            }
          : {
              kind: 'final' as const,
              reminderId: reminder.id,
              occurrenceId: occurrence.id,
            });

      await scheduleFollowUp(
        this.queue.reminders,
        occurrence.idempotencyKey,
        next,
        reminder.repeatIntervalMinutes,
        occurrence.lastSentAt ?? new Date(),
      );
    }
  }

  private async cancelDispatch(reminderId: string): Promise<void> {
    const jobs = await this.queue.reminders.getJobs(['delayed', 'waiting']);
    await Promise.all(
      jobs
        .filter(
          (job) =>
            job.data.reminderId === reminderId &&
            (job.data.kind === undefined || job.data.kind === 'dispatch'),
        )
        .map((job) => job.remove()),
    );
  }
}
