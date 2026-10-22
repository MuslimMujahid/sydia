import { createHash } from 'node:crypto';
import { describe, expect, jest, test } from '@jest/globals';
import { HttpStatus, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type {
  ConsumedCalendarOAuthRequest,
  ICalendarRepository,
} from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import {
  GoogleCalendarService,
  type GoogleCalendarSummary,
  type GoogleOAuthIdentity,
} from '../../infra/calendar';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { CalendarOAuthService } from './calendar-oauth.service.js';

const OAUTH_STATE = 'state-from-google';
const BROWSER_NONCE = 'nonce-from-browser';
const ID_TOKEN_NONCE = 'nonce-from-id-token';
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'email',
].join(' ');

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function oauthHarness(input?: {
  available?: boolean;
  idTokenNonce?: string;
  scopes?: string;
  integrationStatus?: string;
}) {
  const request: ConsumedCalendarOAuthRequest = {
    userId: 'sydia-user-1',
    sessionId: 'session-1',
    idTokenNonceHash: hash(ID_TOKEN_NONCE),
    returnTo: 'https://app.sydia.test/settings?tab=integrations',
  };

  const calendar: GoogleCalendarSummary = {
    id: 'primary-calendar-id',
    name: 'Primary calendar',
    timezone: 'Asia/Makassar',
    primary: true,
    writable: true,
  };

  const identity: GoogleOAuthIdentity = {
    subject: 'google-subject-1',
    email: 'calendar-owner@example.com',
    emailVerified: true,
    nonce: input?.idTokenNonce ?? ID_TOKEN_NONCE,
  };

  const tokens: Awaited<ReturnType<GoogleCalendarService['exchange']>> = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idToken: 'id-token',
    expiresAt: new Date('2026-10-10T13:00:00.000Z'),
    scope: input?.scopes ?? CALENDAR_SCOPES,
  };

  const consumeOAuthRequest = jest
    .fn<
      (
        stateHash: string,
        browserNonceHash: string,
      ) => Promise<ConsumedCalendarOAuthRequest | null>
    >()
    .mockResolvedValue(request);

  const createOAuthRequest = jest
    .fn<ICalendarRepository['createOAuthRequest']>()
    .mockResolvedValue();

  const saveGoogleConnection = jest
    .fn<ICalendarRepository['saveGoogleConnection']>()
    .mockResolvedValue({
      status: 'connected',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });

  const status = jest
    .fn<ICalendarRepository['status']>()
    .mockResolvedValue(null);

  if (input?.integrationStatus)
    status.mockResolvedValue({
      id: 'integration-1',
      provider: 'google',
      status: input.integrationStatus,
      accessTokenExpiresAt: null,
      scope: null,
      calendarId: 'primary-calendar-id',
      googleEmail: 'calendar-owner@example.com',
      connectionGeneration: 3,
      activeBindingId: 'binding-1',
      updatedAt: new Date('2026-10-10T12:00:00.000Z'),
    });
  const beginDisconnect = jest
    .fn<ICalendarRepository['beginDisconnect']>()
    .mockResolvedValue({ connectionStatus: 'disconnecting', channels: [] });

  const integrationCredentials = jest
    .fn<ICalendarRepository['integrationCredentials']>()
    .mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date('2026-10-10T13:00:00.000Z'),
      calendarId: 'primary-calendar-id',
      activeBindingId: 'binding-1',
      credentialGeneration: 3,
      googleSubject: 'google-subject-1',
    });

  const updateAccessToken = jest
    .fn<ICalendarRepository['updateAccessToken']>()
    .mockResolvedValue();

  const markWatchCleanupPending = jest
    .fn<ICalendarRepository['markWatchCleanupPending']>()
    .mockResolvedValue();

  const markWatchChannelStopped = jest
    .fn<ICalendarRepository['markWatchChannelStopped']>()
    .mockResolvedValue();

  const disconnect = jest
    .fn<ICalendarRepository['disconnect']>()
    .mockResolvedValue();

  const calendars = {
    createOAuthRequest,
    consumeOAuthRequest,
    saveGoogleConnection,
    status,
    beginDisconnect,
    integrationCredentials,
    updateAccessToken,
    markWatchCleanupPending,
    markWatchChannelStopped,
    disconnect,
  };

  const google = {
    available: jest
      .fn<GoogleCalendarService['available']>()
      .mockReturnValue(input?.available ?? true),
    authorizationUrl: jest
      .fn<GoogleCalendarService['authorizationUrl']>()
      .mockReturnValue('https://accounts.google.test/oauth'),
    exchange: jest
      .fn<GoogleCalendarService['exchange']>()
      .mockResolvedValue(tokens),
    verifyIdToken: jest
      .fn<GoogleCalendarService['verifyIdToken']>()
      .mockResolvedValue(identity),
    listCalendars: jest
      .fn<GoogleCalendarService['listCalendars']>()
      .mockResolvedValue([calendar]),
    refresh: jest.fn<GoogleCalendarService['refresh']>().mockResolvedValue({
      accessToken: 'refreshed-access-token',
      expiresAt: new Date(),
    }),
    stopWatch: jest
      .fn<GoogleCalendarService['stopWatch']>()
      .mockResolvedValue(),
    revoke: jest.fn<GoogleCalendarService['revoke']>().mockResolvedValue(),
  };

  const add = jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue();

  const queue = { calendarSync: { add } };
  const config = {
    getOrThrow: (key: string) => {
      if (key !== 'FRONTEND_URL')
        throw new Error(`Unexpected config key ${key}`);

      return 'https://app.sydia.test';
    },
    get: (key: string) =>
      key === 'BACKEND_GOOGLE_REDIRECT_URI'
        ? 'https://api.sydia.test/calendar/google/callback'
        : undefined,
  };

  const service = new CalendarOAuthService(
    calendars as unknown as ICalendarRepository,
    google as unknown as GoogleCalendarService,
    config as unknown as ConfigService,
    queue as unknown as QueueService,
  );

  return {
    service,
    request,
    calendar,
    createOAuthRequest,
    consumeOAuthRequest,
    saveGoogleConnection,
    status,
    beginDisconnect,
    integrationCredentials,
    updateAccessToken,
    markWatchCleanupPending,
    markWatchChannelStopped,
    disconnect,
    google,
    add,
  };
}

describe('CalendarOAuthService', () => {
  test('returns an invalid callback to the existing integrations page', async () => {
    const { service } = oauthHarness();

    const result = await service.callback({});

    expect(result.redirectUrl).toBe(
      'https://app.sydia.test/settings/integrations?googleCalendar=failed',
    );
  });

  test('returns cancelled consent to integrations even for an older saved settings URL', async () => {
    const { service } = oauthHarness();

    const result = await service.callback({
      state: OAUTH_STATE,
      browserNonce: BROWSER_NONCE,
      providerError: 'access_denied',
    });

    expect(result.redirectUrl).toBe(
      'https://app.sydia.test/settings/integrations?googleCalendar=denied',
    );
  });

  test('stores OAuth expiry as a TTL for the database clock', async () => {
    const { service, createOAuthRequest } = oauthHarness();

    const result = await service.begin('sydia-user-1', 'session-1');

    expect(result).toMatchObject({
      authorizationUrl: 'https://accounts.google.test/oauth',
      secureCookie: true,
    });
    expect(createOAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'sydia-user-1',
        sessionId: 'session-1',
        expiresInMs: 10 * 60_000,
      }),
    );
  });

  test('keeps Google consent unavailable without creating OAuth state when disabled', async () => {
    const { service, consumeOAuthRequest, saveGoogleConnection } = oauthHarness(
      { available: false },
    );

    const error = await service.begin('sydia-user-1', 'session-1').then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiException);
    if (!(error instanceof ApiException))
      throw new Error(
        'Expected disabled Google consent to reject the request.',
      );
    expect(error.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(consumeOAuthRequest).not.toHaveBeenCalled();
    expect(saveGoogleConnection).not.toHaveBeenCalled();
  });

  test('does not start OAuth again while provider revocation is pending', async () => {
    const { service, createOAuthRequest } = oauthHarness({
      integrationStatus: 'disconnecting',
    });

    const error = await service.begin('sydia-user-1', 'session-1').then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiException);
    if (!(error instanceof ApiException))
      throw new Error('Expected reconnect during disconnect to be rejected.');
    expect(error.code).toBe(ErrorCodes.CONFLICT);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(createOAuthRequest).not.toHaveBeenCalled();
  });

  test('rejects a callback without its browser nonce before consuming OAuth state', async () => {
    const { service, consumeOAuthRequest, saveGoogleConnection, add } =
      oauthHarness();

    const result = await service.callback({ state: OAUTH_STATE, code: 'code' });

    expect(result).toMatchObject({ state: 'failed' });
    expect(new URL(result.redirectUrl).origin).toBe('https://app.sydia.test');
    expect(consumeOAuthRequest).not.toHaveBeenCalled();
    expect(saveGoogleConnection).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  test('persists the verified Google subject and selected writable primary calendar', async () => {
    const {
      service,
      consumeOAuthRequest,
      saveGoogleConnection,
      calendar,
      add,
    } = oauthHarness();

    const result = await service.callback({
      state: OAUTH_STATE,
      browserNonce: BROWSER_NONCE,
      code: 'authorization-code',
    });

    expect(result.state).toBe('connected');
    expect(new URL(result.redirectUrl).searchParams.get('googleCalendar')).toBe(
      'connected',
    );
    expect(consumeOAuthRequest).toHaveBeenCalledWith(
      hash(OAUTH_STATE),
      hash(BROWSER_NONCE),
    );
    expect(saveGoogleConnection).toHaveBeenCalledWith({
      userId: 'sydia-user-1',
      googleSubject: 'google-subject-1',
      googleEmail: 'calendar-owner@example.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date('2026-10-10T13:00:00.000Z'),
      scope: CALENDAR_SCOPES,
      calendar: {
        id: calendar.id,
        name: calendar.name,
        timezone: calendar.timezone,
      },
    });
    expect(add).toHaveBeenCalledWith('calendar-initial-sync', {
      kind: 'pull',
      bindingId: 'binding-1',
      connectionGeneration: 3,
    });
  });

  test('retains the fenced integration when Google authorization revocation fails and completes on retry', async () => {
    const { service, beginDisconnect, disconnect, google } = oauthHarness();
    google.revoke
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockResolvedValueOnce();
    const warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      const firstAttempt = await service.disconnect('sydia-user-1');

      expect(firstAttempt).toEqual({
        connected: false,
        connectionStatus: 'disconnecting',
        cleanupPending: true,
      });
      expect(beginDisconnect).toHaveBeenCalledTimes(1);
      expect(google.revoke).toHaveBeenNthCalledWith(1, 'refresh-token');
      expect(disconnect).not.toHaveBeenCalled();

      const retry = await service.disconnect('sydia-user-1');

      expect(retry).toEqual({
        connected: false,
        connectionStatus: 'disconnected',
        cleanupPending: false,
      });
      expect(beginDisconnect).toHaveBeenCalledTimes(2);
      expect(google.revoke).toHaveBeenNthCalledWith(2, 'refresh-token');
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      warnLog.mockRestore();
    }
  });

  test('does not persist an identity whose ID token nonce differs from the request', async () => {
    const { service, saveGoogleConnection, add } = oauthHarness({
      idTokenNonce: 'nonce-from-a-different-request',
    });

    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      const result = await service.callback({
        state: OAUTH_STATE,
        browserNonce: BROWSER_NONCE,
        code: 'authorization-code',
      });

      expect(result.state).toBe('failed');
      expect(saveGoogleConnection).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith(
        'Google Calendar OAuth callback failed.',
        expect.any(String),
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});
