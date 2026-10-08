import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import type {
  CalendarEvent,
  CalendarEventWrite,
} from '../../database/entities';
import type { PrismaCalendarRepository as PrismaCalendarRepositoryType } from '../../database/repositories';
import type { GoogleCalendarService as GoogleCalendarServiceType } from '../../infra/calendar';
import type { TokenCipher as TokenCipherType } from '../../infra/crypto/token-cipher';
import type { PrismaService } from '../../infra/prisma';
import type { CalendarService as CalendarServiceType } from './calendar.service';

// Keep the real cipher and adapters; replace only their external boundaries.
jest.unstable_mockModule('node:crypto', () => ({
  ...crypto,
  randomBytes: (size: number) => Buffer.alloc(size, 1),
}));

let PrismaCalendarRepository: typeof PrismaCalendarRepositoryType;
let GoogleCalendarService: typeof GoogleCalendarServiceType;
let TokenCipher: typeof TokenCipherType;
let CalendarService: typeof CalendarServiceType;

beforeAll(async () => {
  ({ PrismaCalendarRepository } =
    await import('../../database/repositories/index.js'));
  ({ GoogleCalendarService } = await import('../../infra/calendar/index.js'));
  ({ TokenCipher } = await import('../../infra/crypto/token-cipher.js'));
  ({ CalendarService } = await import('./calendar.service.js'));
});

type StoredIntegration = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  calendarId: string | null;
};

type EventData = CalendarEventWrite & {
  userId: string;
  provider?: string;
  providerEventId?: string | null;
};

type TokenUpdate = {
  where: { userId_provider: { userId: string; provider: string } };
  data: {
    accessToken: string;
    accessTokenExpiresAt: Date;
    status: string;
  };
};

const USER_ID = 'user-1';
const NOW = new Date('2026-01-01T12:00:00.000Z');

function meeting(): CalendarEventWrite {
  return {
    title: 'Project review',
    startAt: new Date('2026-01-02T09:00:00.000Z'),
    endAt: new Date('2026-01-02T10:00:00.000Z'),
    timezone: 'UTC',
  };
}

function createService(stored: StoredIntegration) {
  const findUnique = jest
    .fn<(input: unknown) => Promise<StoredIntegration>>()
    .mockResolvedValue(stored);

  const update = jest
    .fn<(input: TokenUpdate) => Promise<void>>()
    .mockResolvedValue(undefined);

  const create = jest.fn<
    (input: { data: EventData }) => Promise<CalendarEvent>
  >(({ data }) =>
    Promise.resolve({
      id: 'event-1',
      provider: 'local',
      providerEventId: null,
      description: null,
      location: null,
      attendees: [],
      status: 'confirmed',
      createdAt: NOW,
      updatedAt: NOW,
      ...data,
    }),
  );

  const prisma = {
    calendarIntegration: { findUnique, update },
    calendarEvent: { create },
  } as unknown as PrismaService;

  const config = new ConfigService({
    BACKEND_GOOGLE_CLIENT_ID: 'test-client',
    BACKEND_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    BACKEND_GOOGLE_REDIRECT_URI: 'https://sydia.test/calendar/callback',
    BACKEND_TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key',
  });

  const cipher = new TokenCipher(config);
  const repository = new PrismaCalendarRepository(prisma, cipher);
  const service = new CalendarService(
    repository,
    new GoogleCalendarService(config),
  );

  return { service, update, cipher };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('CalendarService create', () => {
  test('creates a Google event with refreshed credentials and persists their expiry', async () => {
    const { service, update, cipher } = createService({
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: new Date('2026-01-01T11:00:00.000Z'),
      calendarId: 'work',
    });

    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ access_token: 'refreshed-token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'google-event-1' }));

    const result = await service.create(USER_ID, meeting());

    expect(result).toMatchObject({
      title: 'Project review',
      provider: 'google',
      providerEventId: 'google-event-1',
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        body: new URLSearchParams({
          client_id: 'test-client',
          client_secret: 'test-client-secret',
          grant_type: 'refresh_token',
          refresh_token: 'refresh-token',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/calendar/v3/calendars/work/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer refreshed-token',
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: { userId_provider: { userId: USER_ID, provider: 'google' } },
      data: {
        accessToken: expect.stringMatching(/^v1\./),
        // The fixed 12:00 clock plus the provider's 3600-second lifetime is 13:00.
        accessTokenExpiresAt: new Date('2026-01-01T13:00:00.000Z'),
        status: 'connected',
      },
    });
    expect(cipher.decrypt(update.mock.calls[0]![0].data.accessToken)).toBe(
      'refreshed-token',
    );
  });

  test('creates a Google event in the primary calendar without refreshing an unexpired token', async () => {
    const { service, update } = createService({
      accessToken: 'cached-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: new Date('2026-01-01T12:01:00.000Z'),
      calendarId: null,
    });

    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'google-event-1' }));

    const result = await service.create(USER_ID, meeting());

    expect(result).toMatchObject({
      provider: 'google',
      providerEventId: 'google-event-1',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer cached-token',
        }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  test.each([
    {
      scenario: 'an expired token has no refresh token',
      stored: {
        accessToken: 'expired-token',
        refreshToken: null,
        accessTokenExpiresAt: new Date('2026-01-01T11:00:00.000Z'),
        calendarId: null,
      },
    },
    {
      scenario: 'the access token is missing',
      stored: {
        accessToken: null,
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: new Date('2026-01-01T13:00:00.000Z'),
        calendarId: null,
      },
    },
    {
      scenario: 'the token expiry is missing',
      stored: {
        accessToken: 'cached-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: null,
        calendarId: null,
      },
    },
  ])(
    'creates a local event without contacting Google when $scenario',
    async ({ stored }) => {
      const { service, update } = createService(stored);
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected Google request'));

      const result = await service.create(USER_ID, meeting());

      expect(result).toMatchObject({
        id: 'event-1',
        title: 'Project review',
        provider: 'local',
        providerEventId: null,
        startAt: new Date('2026-01-02T09:00:00.000Z'),
        endAt: new Date('2026-01-02T10:00:00.000Z'),
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );
});
