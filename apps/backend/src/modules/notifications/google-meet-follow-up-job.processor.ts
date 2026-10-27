import type { GoogleMeetFollowUpJob } from '../../infra/queue';
import { googleMeetOutcomeKey } from '../calendar/google-meet-follow-up';
import type { GoogleMeetFollowUpService } from '../calendar/google-meet-follow-up.service';
import type { NotificationService } from './notification.service';
import type { NotificationComposerService } from './notification-composer.service';

type GoogleMeetFollowUpJobDependencies = {
  googleMeetFollowUps: Pick<GoogleMeetFollowUpService, 'poll'>;
  notifications: Pick<NotificationService, 'enqueue'>;
  composer: Pick<NotificationComposerService, 'googleMeetOutcomeBody'>;
};

export async function processGoogleMeetFollowUpJob(
  {
    googleMeetFollowUps,
    notifications,
    composer,
  }: GoogleMeetFollowUpJobDependencies,
  job: GoogleMeetFollowUpJob,
): Promise<void> {
  const outcome = await googleMeetFollowUps.poll(job);
  // Still pending, cancelled, or already settled and announced.
  if (!outcome) return;

  await notifications.enqueue({
    userId: outcome.userId,
    kind: 'google_meet_ready',
    content: await composer.googleMeetOutcomeBody(outcome.userId, outcome),
    idempotencyKey: googleMeetOutcomeKey(outcome),
    proactive: true,
    sourceId: outcome.eventId,
  });
}
