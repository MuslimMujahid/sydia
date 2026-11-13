import type { Queue } from 'bullmq';
import type {
  ReminderFinalJob,
  ReminderJob,
  ReminderRepeatJob,
} from '../../infra/queue';

const MINUTE_MS = 60_000;

/** BullMQ forbids ':' in custom job ids. */
export function reminderJobId(idempotencyKey: string): string {
  return idempotencyKey.replaceAll(':', '-');
}

export function followUpJobId(
  occurrenceKey: string,
  job:
    | Pick<ReminderRepeatJob, 'kind' | 'sequence'>
    | Pick<ReminderFinalJob, 'kind'>,
): string {
  return reminderJobId(
    job.kind === 'repeat'
      ? `${occurrenceKey}:repeat:${job.sequence}`
      : `${occurrenceKey}:final`,
  );
}

/** Enqueues the next repeat or final note `intervalMinutes` after `from`. */
export async function scheduleFollowUp(
  queue: Pick<Queue<ReminderJob>, 'add'>,
  occurrenceKey: string,
  job: ReminderRepeatJob | ReminderFinalJob,
  intervalMinutes: number,
  from: Date,
  now = Date.now(),
): Promise<void> {
  await queue.add(job.kind, job, {
    jobId: followUpJobId(occurrenceKey, job),
    delay: Math.max(0, from.getTime() + intervalMinutes * MINUTE_MS - now),
  });
}

function isFollowUp(
  data: ReminderJob,
): data is ReminderRepeatJob | ReminderFinalJob {
  return data.kind === 'repeat' || data.kind === 'final';
}

/** Removes pending repeat/final jobs, optionally only for one occurrence. */
export async function cancelFollowUps(
  queue: Pick<Queue<ReminderJob>, 'getJobs'>,
  filter: { reminderId?: string; occurrenceId?: string },
): Promise<Array<ReminderRepeatJob | ReminderFinalJob>> {
  const jobs = await queue.getJobs(['delayed', 'waiting']);
  const removed: Array<ReminderRepeatJob | ReminderFinalJob> = [];

  await Promise.all(
    jobs.map(async (job) => {
      const data = job.data;
      if (
        !isFollowUp(data) ||
        (filter.reminderId && data.reminderId !== filter.reminderId) ||
        (filter.occurrenceId && data.occurrenceId !== filter.occurrenceId)
      )
        return;
      await job.remove();
      removed.push(data);
    }),
  );

  return removed;
}
