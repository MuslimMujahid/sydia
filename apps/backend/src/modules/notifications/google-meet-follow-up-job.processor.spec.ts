import { describe, expect, jest, test } from '@jest/globals';
import type { GoogleMeetFollowUpJob } from '../../infra/queue';
import type {
  GoogleMeetFollowUpService,
  GoogleMeetOutcome,
} from '../calendar/google-meet-follow-up.service';
import { processGoogleMeetFollowUpJob } from './google-meet-follow-up-job.processor';
import type { NotificationService } from './notification.service';
import type { NotificationComposerService } from './notification-composer.service';

const JOB: GoogleMeetFollowUpJob = {
  kind: 'poll',
  userId: 'user-1',
  eventId: 'event-1',
  attempt: 0,
};

const READY: GoogleMeetOutcome = {
  userId: 'user-1',
  eventId: 'event-1',
  title: 'Sprint review',
  status: 'success',
  googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
};

function harness(outcome: GoogleMeetOutcome | null) {
  const poll = jest
    .fn<GoogleMeetFollowUpService['poll']>()
    .mockResolvedValue(outcome);

  const enqueue = jest.fn<NotificationService['enqueue']>().mockResolvedValue({
    deliveries: [],
    replayed: false,
    policyOutcome: 'queued',
  });

  const googleMeetOutcomeBody = jest
    .fn<NotificationComposerService['googleMeetOutcomeBody']>()
    .mockResolvedValue('composed body');

  const run = () =>
    processGoogleMeetFollowUpJob(
      {
        googleMeetFollowUps: { poll },
        notifications: { enqueue },
        composer: { googleMeetOutcomeBody },
      },
      JOB,
    );

  return { run, poll, enqueue, googleMeetOutcomeBody };
}

describe('Google Meet follow-up job', () => {
  test('a ready link is enqueued once with an outcome-scoped key', async () => {
    const { run, enqueue } = harness(READY);

    await run();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'google_meet_ready',
      content: 'composed body',
      idempotencyKey: 'google-meet:event-1:success',
      proactive: true,
      sourceId: 'event-1',
    });
  });

  test('a failed conference carries its own idempotency key', async () => {
    const { run, enqueue } = harness({
      ...READY,
      status: 'failure',
      googleMeetUrl: null,
    });

    await run();

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'google-meet:event-1:failure',
      }),
    );
  });

  test('reprocessing the same job replays one stable delivery key', async () => {
    const { run, enqueue } = harness(READY);

    await run();
    await run();

    expect(enqueue).toHaveBeenCalledTimes(2);
    const [first, second] = enqueue.mock.calls;
    expect(first![0].idempotencyKey).toBe(second![0].idempotencyKey);
  });

  test('a pending or irrelevant poll sends nothing', async () => {
    const { run, enqueue, googleMeetOutcomeBody } = harness(null);

    await run();

    expect(enqueue).not.toHaveBeenCalled();
    expect(googleMeetOutcomeBody).not.toHaveBeenCalled();
  });
});
