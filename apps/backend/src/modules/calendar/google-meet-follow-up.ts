import { createHash } from 'node:crypto';
import type { QueueService, GoogleMeetFollowUpJob } from '../../infra/queue';

/**
 * Google answers a conference create request asynchronously, so a Meet link is
 * often still `pending` when the write operation completes. These delays bound
 * how long we keep asking before giving up quietly.
 */
export const GOOGLE_MEET_POLL_DELAYS_MS = [
  5_000, 15_000, 45_000, 120_000, 300_000,
] as const;

/** One notification per event and final status, replayed without duplicating. */
export function googleMeetOutcomeKey(input: {
  eventId: string;
  status: string;
}): string {
  return `google-meet:${input.eventId}:${input.status}`;
}

export function googleMeetFollowUpJobId(job: GoogleMeetFollowUpJob): string {
  // Queue IDs are global; hash the user-scoped tuple without BullMQ's ':'.
  return createHash('sha256')
    .update(JSON.stringify([job.userId, job.eventId, job.attempt]))
    .digest('hex');
}

/**
 * Enqueues one bounded follow-up attempt. Returns `false` once the schedule is
 * exhausted, so callers can log the give-up instead of polling forever.
 */
export async function enqueueGoogleMeetFollowUp(
  queues: Pick<QueueService, 'googleMeetFollowUps'>,
  userId: string,
  eventId: string,
  attempt: number,
): Promise<boolean> {
  const delay = GOOGLE_MEET_POLL_DELAYS_MS[attempt];
  if (delay === undefined) return false;

  const job: GoogleMeetFollowUpJob = {
    kind: 'poll',
    userId,
    eventId,
    attempt,
  };

  const jobId = googleMeetFollowUpJobId(job);
  const existing = await queues.googleMeetFollowUps.getJob(jobId);
  if (existing && (await existing.getState()) === 'failed')
    await existing.remove();
  await queues.googleMeetFollowUps.add('poll', job, { jobId, delay });

  return true;
}
