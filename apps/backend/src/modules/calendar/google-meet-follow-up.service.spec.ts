import { describe, expect, jest, test } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type {
  GoogleMeetTarget,
  GoogleMeetTransition,
  ICalendarRepository,
} from '../../database/interfaces';
import type { GoogleCalendarService } from '../../infra/calendar';
import type { QueueService, GoogleMeetFollowUpJob } from '../../infra/queue';
import type { CalendarSyncService } from './calendar-sync.service';
import { GOOGLE_MEET_POLL_DELAYS_MS } from './google-meet-follow-up';
import { GoogleMeetFollowUpService } from './google-meet-follow-up.service.js';

const PENDING_RESOURCE = {
  id: 'google-event-1',
  etag: 'etag-2',
  conferenceData: { createRequest: { status: { statusCode: 'pending' } } },
};

const READY_RESOURCE = {
  id: 'google-event-1',
  etag: 'etag-2',
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
};

const FAILED_RESOURCE = {
  id: 'google-event-1',
  etag: 'etag-2',
  conferenceData: { createRequest: { status: { statusCode: 'failure' } } },
};

function job(attempt = 0): GoogleMeetFollowUpJob {
  return { kind: 'poll', userId: 'user-1', eventId: 'event-1', attempt };
}

function harness(input?: {
  target?: GoogleMeetTarget | null;
  transition?: GoogleMeetTransition;
  resource?: Record<string, unknown>;
  accessToken?: string | null;
  available?: boolean;
}) {
  const target: GoogleMeetTarget | null =
    input?.target === undefined
      ? {
          title: 'Sprint review',
          googleEventId: 'google-event-1',
          bindingId: 'binding-1',
          calendarId: 'calendar-1',
          googleSubject: 'google-subject-1',
          connectionGeneration: 3,
          status: 'confirmed',
          meetStatus: 'pending',
          meetUrl: null,
        }
      : input.target;

  const googleMeetTarget = jest
    .fn<ICalendarRepository['googleMeetTarget']>()
    .mockResolvedValue(target);

  const saveGoogleMeetSnapshot = jest
    .fn<ICalendarRepository['saveGoogleMeetSnapshot']>()
    .mockResolvedValue(
      input?.transition ?? {
        status: 'saved',
        previous: 'pending',
        current: 'success',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        title: 'Sprint review',
      },
    );

  const getEvent = jest
    .fn<GoogleCalendarService['getEvent']>()
    .mockResolvedValue(input?.resource ?? READY_RESOURCE);

  const accessTokenForUser = jest
    .fn<CalendarSyncService['accessTokenForUser']>()
    .mockResolvedValue(
      input?.accessToken === undefined ? 'access-token' : input.accessToken,
    );

  const add = jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue();

  const getJob = jest.fn<() => Promise<null>>().mockResolvedValue(null);

  const service = new GoogleMeetFollowUpService(
    {
      googleMeetTarget,
      saveGoogleMeetSnapshot,
    } as unknown as ICalendarRepository,
    {
      available: jest
        .fn<() => boolean>()
        .mockReturnValue(input?.available ?? true),
      getEvent,
    } as unknown as GoogleCalendarService,
    { accessTokenForUser } as unknown as CalendarSyncService,
    { googleMeetFollowUps: { add, getJob } } as unknown as QueueService,
  );

  return {
    service,
    googleMeetTarget,
    saveGoogleMeetSnapshot,
    getEvent,
    accessTokenForUser,
    add,
  };
}

describe('Google Meet follow-up polling', () => {
  test('a resolved conference reports the success outcome once', async () => {
    const { service, saveGoogleMeetSnapshot, add } = harness();

    await expect(service.poll(job())).resolves.toEqual({
      userId: 'user-1',
      eventId: 'event-1',
      title: 'Sprint review',
      status: 'success',
      googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
    });

    expect(saveGoogleMeetSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventId: 'event-1',
        googleEventId: 'google-event-1',
        bindingId: 'binding-1',
        remoteEtag: 'etag-2',
      }),
    );
    // A settled conference stops the chain.
    expect(add).not.toHaveBeenCalled();
  });

  test('a rejected conference reports the failure outcome', async () => {
    const { service } = harness({
      resource: FAILED_RESOURCE,
      transition: {
        status: 'saved',
        previous: 'pending',
        current: 'failure',
        googleMeetUrl: null,
        title: 'Sprint review',
      },
    });

    await expect(service.poll(job())).resolves.toEqual({
      userId: 'user-1',
      eventId: 'event-1',
      title: 'Sprint review',
      status: 'failure',
      googleMeetUrl: null,
    });
  });

  test('a still-pending conference schedules the next attempt without notifying', async () => {
    const { service, add } = harness({
      resource: PENDING_RESOURCE,
      transition: {
        status: 'saved',
        previous: 'pending',
        current: 'pending',
        googleMeetUrl: null,
        title: 'Sprint review',
      },
    });

    await expect(service.poll(job(1))).resolves.toBeNull();
    expect(add).toHaveBeenCalledWith(
      'poll',
      { kind: 'poll', userId: 'user-1', eventId: 'event-1', attempt: 2 },
      expect.objectContaining({ delay: GOOGLE_MEET_POLL_DELAYS_MS[2] }),
    );
  });

  test('a conference still pending after the last attempt gives up with a warning', async () => {
    const { service, add } = harness({
      resource: PENDING_RESOURCE,
      transition: {
        status: 'saved',
        previous: 'pending',
        current: 'pending',
        googleMeetUrl: null,
        title: 'Sprint review',
      },
    });

    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    try {
      await expect(
        service.poll(job(GOOGLE_MEET_POLL_DELAYS_MS.length - 1)),
      ).resolves.toBeNull();
      expect(add).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('still pending after'),
        expect.any(String),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test('an already settled conference is not re-read or re-announced', async () => {
    const { service, getEvent, saveGoogleMeetSnapshot } = harness({
      target: {
        title: 'Sprint review',
        googleEventId: 'google-event-1',
        bindingId: 'binding-1',
        calendarId: 'calendar-1',
        googleSubject: 'google-subject-1',
        connectionGeneration: 3,
        status: 'confirmed',
        meetStatus: 'success',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      },
    });

    await expect(service.poll(job())).resolves.toBeNull();
    expect(getEvent).not.toHaveBeenCalled();
    expect(saveGoogleMeetSnapshot).not.toHaveBeenCalled();
  });

  test('a cancelled event is dropped before any provider request', async () => {
    const { service, getEvent } = harness({
      target: {
        title: 'Sprint review',
        googleEventId: 'google-event-1',
        bindingId: 'binding-1',
        calendarId: 'calendar-1',
        googleSubject: 'google-subject-1',
        connectionGeneration: 3,
        status: 'cancelled',
        meetStatus: 'pending',
        meetUrl: null,
      },
    });

    await expect(service.poll(job())).resolves.toBeNull();
    expect(getEvent).not.toHaveBeenCalled();
  });

  test('an unlinked or disconnected event is dropped', async () => {
    const { service, getEvent } = harness({ target: null });

    await expect(service.poll(job())).resolves.toBeNull();
    expect(getEvent).not.toHaveBeenCalled();
  });

  test('a snapshot that no longer matches the polled event does not notify', async () => {
    const { service } = harness({ transition: { status: 'stale' } });

    await expect(service.poll(job())).resolves.toBeNull();
  });

  test('a repeat of an already announced transition does not notify again', async () => {
    const { service } = harness({
      transition: {
        status: 'saved',
        previous: 'success',
        current: 'success',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        title: 'Sprint review',
      },
    });

    await expect(service.poll(job())).resolves.toBeNull();
  });

  test('a missing Google credential leaves the conference pending without a message', async () => {
    const { service, getEvent } = harness({ accessToken: null });

    await expect(service.poll(job())).resolves.toBeNull();
    expect(getEvent).not.toHaveBeenCalled();
  });

  test('a provider error fails loudly so the queue retries', async () => {
    const { service, getEvent } = harness();
    getEvent.mockRejectedValue(new Error('google_503_backend_error'));

    await expect(service.poll(job())).rejects.toThrow(
      'google_503_backend_error',
    );
  });
});
