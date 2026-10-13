import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  GoogleCalendarRequestContext,
  GoogleCalendarRequestLimiter,
} from './google-calendar-request-limiter.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';

describe('GoogleCalendarService when sync is disabled', () => {
  test('rejects Calendar API calls before admission or network access', async () => {
    const requestLimiter = {
      acquire: jest.fn(),
      release: jest.fn(),
    };

    const service = new GoogleCalendarService(
      {
        get: (key: string, fallback?: unknown) =>
          key === 'BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED' ? 'false' : fallback,
      } as unknown as ConfigService,
      requestLimiter as unknown as GoogleCalendarRequestLimiter,
    );

    const context: GoogleCalendarRequestContext = {
      googleSubject: 'google-subject-1',
      calendarId: 'calendar-1',
      lane: 'interactive',
    };

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected Google Calendar request.'));

    try {
      await expect(
        service.getEvent('access-token', 'calendar-1', 'event-1', context),
      ).rejects.toThrow('Google Calendar sync is disabled on this server.');

      expect(requestLimiter.acquire).not.toHaveBeenCalled();
      expect(requestLimiter.release).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('GoogleCalendarService conditional updates', () => {
  test('PATCH sends only supplied common fields and the private operation marker', async () => {
    const requestLimiter = {
      acquire: jest
        .fn<GoogleCalendarRequestLimiter['acquire']>()
        .mockResolvedValue({
          id: 'lease-owner',
          keys: ['project', 'subject', 'calendar', 'outbound', 'pull', 'watch'],
        }),
      release: jest
        .fn<GoogleCalendarRequestLimiter['release']>()
        .mockResolvedValue(undefined),
    };

    const service = new GoogleCalendarService(
      new ConfigService({
        BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
        BACKEND_GOOGLE_CLIENT_ID: 'synthetic-client',
        BACKEND_GOOGLE_CLIENT_SECRET: 'synthetic-secret',
        BACKEND_GOOGLE_REDIRECT_URI:
          'https://example.test/calendar/google/callback',
      }),
      requestLimiter as unknown as GoogleCalendarRequestLimiter,
    );

    const context: GoogleCalendarRequestContext = {
      googleSubject: 'subject',
      calendarId: 'calendar-1',
      lane: 'outbound',
    };

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'event-1', etag: 'etag-2' }), {
        status: 200,
      }),
    );

    try {
      await service.updateEvent(
        'synthetic-token',
        'calendar-1',
        'event-1',
        'operation-1',
        { title: 'Edited' },
        'etag-1',
        context,
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://www.googleapis.com/calendar/v3/calendars/calendar-1/events/event-1?sendUpdates=all&conferenceDataVersion=1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'If-Match': 'etag-1' }),
          body: JSON.stringify({
            summary: 'Edited',
            extendedProperties: {
              private: { sydiaOperationId: 'operation-1' },
            },
          }),
        }),
      );
      expect(requestLimiter.release).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('GoogleCalendarService incremental pagination', () => {
  test('a continuation request sends both cursor tokens with the unchanged event filters', async () => {
    const limiter = {
      acquire: jest
        .fn<GoogleCalendarRequestLimiter['acquire']>()
        .mockResolvedValue({
          id: 'pagination-lease',
          keys: ['p', 's', 'c', 'o', 'i', 'w'],
        }),
      release: jest
        .fn<GoogleCalendarRequestLimiter['release']>()
        .mockResolvedValue(undefined),
    };

    const service = new GoogleCalendarService(
      new ConfigService({
        BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
        BACKEND_GOOGLE_CLIENT_ID: 'synthetic-client',
        BACKEND_GOOGLE_CLIENT_SECRET: 'synthetic-secret',
        BACKEND_GOOGLE_REDIRECT_URI: 'https://example.test/callback',
      }),
      limiter as unknown as GoogleCalendarRequestLimiter,
    );

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], nextSyncToken: 'next-sync-token' }),
          { status: 200 },
        ),
      );

    try {
      const page = await service.listEvents(
        'synthetic-token',
        'calendar-1',
        { pageToken: 'page-token-2', syncToken: 'original-sync-token' },
        { googleSubject: 'subject', calendarId: 'calendar-1', lane: 'pull' },
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://www.googleapis.com/calendar/v3/calendars/calendar-1/events?singleEvents=false&showDeleted=true&eventTypes=default&maxResults=250&pageToken=page-token-2&syncToken=original-sync-token',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(page).toEqual({
        items: [],
        nextPageToken: null,
        nextSyncToken: 'next-sync-token',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('GoogleCalendarService request fencing', () => {
  test('a claim lost during admission prevents network access and releases the permit', async () => {
    const requestLimiter = {
      acquire: jest
        .fn<GoogleCalendarRequestLimiter['acquire']>()
        .mockResolvedValue({
          id: 'lease',
          keys: ['p', 's', 'c', 'o', 'i', 'w'],
        }),
      release: jest
        .fn<GoogleCalendarRequestLimiter['release']>()
        .mockResolvedValue(undefined),
    };

    const service = new GoogleCalendarService(
      new ConfigService({
        BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
        BACKEND_GOOGLE_CLIENT_ID: 'client',
        BACKEND_GOOGLE_CLIENT_SECRET: 'secret',
        BACKEND_GOOGLE_REDIRECT_URI: 'https://example.test/callback',
      }),
      requestLimiter as unknown as GoogleCalendarRequestLimiter,
    );

    const fence = new Error('synthetic expired worker claim');
    const beforeRequest = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(fence);

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'event' }), { status: 200 }),
      );

    try {
      await expect(
        service.getEvent('token', 'calendar', 'event', {
          googleSubject: 'subject',
          calendarId: 'calendar',
          lane: 'outbound',
          beforeRequest,
        }),
      ).rejects.toBe(fence);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(requestLimiter.release).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('GoogleCalendarService refresh fencing', () => {
  test('an invalid refresh claim prevents the token endpoint request', async () => {
    const service = new GoogleCalendarService(
      new ConfigService({
        BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
        BACKEND_GOOGLE_CLIENT_ID: 'client',
        BACKEND_GOOGLE_CLIENT_SECRET: 'secret',
        BACKEND_GOOGLE_REDIRECT_URI: 'https://example.test/callback',
      }),
      {} as GoogleCalendarRequestLimiter,
    );

    const failure = new Error('synthetic replaced refresh claim');
    const beforeRequest = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(failure);

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected token request'));

    try {
      await expect(
        service.refresh('synthetic-refresh-token', beforeRequest),
      ).rejects.toBe(failure);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

function meetRequestHarness() {
  const service = new GoogleCalendarService(
    new ConfigService({
      BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED: 'true',
      BACKEND_GOOGLE_CLIENT_ID: 'synthetic-client',
      BACKEND_GOOGLE_CLIENT_SECRET: 'synthetic-secret',
      BACKEND_GOOGLE_REDIRECT_URI:
        'https://example.test/calendar/google/callback',
    }),
    {
      acquire: jest
        .fn<GoogleCalendarRequestLimiter['acquire']>()
        .mockResolvedValue({
          id: 'lease',
          keys: ['project', 'subject', 'calendar', 'outbound', 'pull', 'watch'],
        }),
      release: jest
        .fn<GoogleCalendarRequestLimiter['release']>()
        .mockResolvedValue(undefined),
    } as unknown as GoogleCalendarRequestLimiter,
  );

  const context: GoogleCalendarRequestContext = {
    googleSubject: 'subject',
    calendarId: 'primary',
    lane: 'outbound',
  };

  return { service, context };
}

test('creating a Meet conference sends a stable request id and conference version', async () => {
  const { service, context } = meetRequestHarness();
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{"id":"event-1"}'));

  try {
    await service.createEvent(
      'synthetic-token',
      'primary',
      'event-1',
      'operation-1',
      {
        title: 'Meeting',
        startAt: new Date('2026-10-12T01:00:00Z'),
        endAt: new Date('2026-10-12T02:00:00Z'),
        timezone: 'Asia/Makassar',
        createGoogleMeet: true,
      },
      context,
    );
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toEqual(expect.stringContaining('conferenceDataVersion=1'));
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      conferenceData: {
        createRequest: {
          requestId: 'operation-1',
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    });
  } finally {
    fetchSpy.mockRestore();
  }
});

test('disabling Google Meet explicitly clears provider conference data', async () => {
  const { service, context } = meetRequestHarness();
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{"id":"event-1"}'));

  try {
    await service.updateEvent(
      'synthetic-token',
      'primary',
      'event-1',
      'operation-2',
      { createGoogleMeet: false },
      'etag-1',
      context,
    );
    const body = fetchSpy.mock.calls[0]![1]?.body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toMatchObject({
      conferenceData: null,
    });
  } finally {
    fetchSpy.mockRestore();
  }
});
