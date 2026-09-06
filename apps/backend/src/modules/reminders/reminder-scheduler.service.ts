import { Inject, Injectable } from '@nestjs/common';
import {
  REMINDER_REPOSITORY,
  USER_REPOSITORY,
  type IReminderRepository,
  type IUserRepository,
} from '../../database/interfaces';
import type { Reminder } from '../../database/entities';
import { QueueService } from '../../infra/queue';

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

  async schedule(reminder: Reminder): Promise<void> {
    await this.cancel(reminder.id);
    if (reminder.status !== 'scheduled') return;
    const key = await this.reminders.createOccurrence(
      reminder.id,
      reminder.scheduledAt,
    );

    const jobId = key.replaceAll(':', '-');
    const existingJob = await this.queue.reminders.getJob(jobId);

    if (
      existingJob &&
      ['completed', 'failed'].includes(await existingJob.getState())
    ) {
      await existingJob.remove();
    }

    await this.queue.reminders.add(
      'dispatch',
      { reminderId: reminder.id, idempotencyKey: key },
      {
        jobId,
        delay: Math.max(0, reminder.scheduledAt.getTime() - Date.now()),
      },
    );
  }

  async cancel(reminderId: string): Promise<void> {
    const jobs = await this.queue.reminders.getJobs(['delayed', 'waiting']);
    await Promise.all(
      jobs
        .filter((job) => job.data.reminderId === reminderId)
        .map((job) => job.remove()),
    );
  }
}
