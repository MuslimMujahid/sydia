import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CALENDAR_REPOSITORY,
  type GoogleMeetStatus,
  type ICalendarRepository,
} from '../../database/interfaces';
import { GoogleCalendarService } from '../../infra/calendar';
import { QueueService, type GoogleMeetFollowUpJob } from '../../infra/queue';
import { CalendarSyncService } from './calendar-sync.service';
import {
  enqueueGoogleMeetFollowUp,
  GOOGLE_MEET_POLL_DELAYS_MS,
} from './google-meet-follow-up';

export type GoogleMeetOutcome = {
  userId: string;
  eventId: string;
  title: string;
  status: Extract<GoogleMeetStatus, 'success' | 'failure'>;
  googleMeetUrl: string | null;
};

/**
 * Re-reads a Google event until its Meet conference resolves, persists the
 * fresh provider snapshot, and reports the pending -> success/failure
 * transition so exactly one proactive message is sent.
 */
@Injectable()
export class GoogleMeetFollowUpService {
  private readonly logger = new Logger(GoogleMeetFollowUpService.name);

  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly google: GoogleCalendarService,
    private readonly sync: CalendarSyncService,
    private readonly queues: QueueService,
  ) {}

  /** Starts (or re-arms) the bounded polling chain for one event. */
  async schedule(
    userId: string,
    eventId: string,
    attempt = 0,
  ): Promise<boolean> {
    return enqueueGoogleMeetFollowUp(this.queues, userId, eventId, attempt);
  }

  /**
   * Runs one poll. Returns the outcome to notify about, or `null` when the
   * conference is still pending, already settled, or no longer relevant.
   */
  async poll(job: GoogleMeetFollowUpJob): Promise<GoogleMeetOutcome | null> {
    if (!this.google.available()) return null;
    const target = await this.calendars.googleMeetTarget(
      job.userId,
      job.eventId,
    );

    // Cancelled, unlinked, or disconnected: the promise no longer applies.
    if (!target || target.status === 'cancelled') return null;
    // Another writer already settled this conference and notified for it.
    if (target.meetStatus !== 'pending') return null;

    const accessToken = await this.sync.accessTokenForUser(job.userId);

    if (!accessToken) {
      this.logger.warn(
        `Google Meet follow-up for event ${job.eventId} found no usable Google credentials; the conference stays pending.`,
      );

      return null;
    }

    const resource = await this.google.getEvent(
      accessToken,
      target.calendarId,
      target.googleEventId,
      {
        googleSubject: target.googleSubject,
        calendarId: target.calendarId,
        lane: 'pull',
      },
    );

    const saved = await this.calendars.saveGoogleMeetSnapshot({
      userId: job.userId,
      eventId: job.eventId,
      googleEventId: target.googleEventId,
      bindingId: target.bindingId,
      remoteSnapshot: resource,
      remoteEtag: typeof resource.etag === 'string' ? resource.etag : null,
    });

    if (saved.status !== 'saved') return null;

    if (saved.current === 'success' || saved.current === 'failure') {
      // Only the transition out of `pending` earns a message.
      if (saved.previous === saved.current) return null;

      return {
        userId: job.userId,
        eventId: job.eventId,
        title: saved.title,
        status: saved.current,
        googleMeetUrl: saved.googleMeetUrl,
      };
    }

    if (await this.schedule(job.userId, job.eventId, job.attempt + 1))
      return null;

    this.logger.warn(
      `Google Meet conference for event ${job.eventId} is still pending after ${GOOGLE_MEET_POLL_DELAYS_MS.length} attempts; no message was sent.`,
      JSON.stringify({
        userId: job.userId,
        eventId: job.eventId,
        googleEventId: target.googleEventId,
        bindingId: target.bindingId,
        connectionGeneration: target.connectionGeneration,
      }),
    );

    return null;
  }
}
