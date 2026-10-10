import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  CALENDAR_REPOSITORY,
  type ICalendarRepository,
} from '../../database/interfaces';
import { GoogleCalendarService } from '../../infra/calendar';
import { calendarSyncMetrics } from '../../infra/calendar/calendar-sync.metrics';
import { QueueService } from '../../infra/queue';
import { ApiException, ErrorCodes } from '../../shared/errors';

export const GOOGLE_CALENDAR_OAUTH_COOKIE = 'sydia_google_calendar_oauth';
const OAUTH_REQUEST_TTL_MS = 10 * 60_000;
const REQUIRED_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

const EMAIL_SCOPES = new Set([
  'email',
  'https://www.googleapis.com/auth/userinfo.email',
]);

export type GoogleCalendarOAuthCallback = {
  code?: string;
  state?: string;
  providerError?: string;
  browserNonce?: string;
};

export type GoogleCalendarOAuthCallbackResult = {
  redirectUrl: string;
  state: 'connected' | 'denied' | 'failed' | 'needs_offline_consent';
};

export type CalendarDisconnectResult = {
  connected: false;
  connectionStatus: 'disconnected' | 'disconnecting';
  cleanupPending: boolean;
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');

  return (
    leftBytes.length === rightBytes.length &&
    leftBytes.length > 0 &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

@Injectable()
export class CalendarOAuthService {
  private readonly logger = new Logger(CalendarOAuthService.name);
  private readonly frontendUrl: URL;
  private readonly cookieSecure: boolean;

  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly google: GoogleCalendarService,
    config: ConfigService,
    @Optional() private readonly queues?: QueueService,
  ) {
    this.frontendUrl = new URL(config.getOrThrow<string>('FRONTEND_URL'));
    const redirectUri = config.get<string>('BACKEND_GOOGLE_REDIRECT_URI');
    this.cookieSecure =
      this.google.available() && redirectUri
        ? new URL(redirectUri).protocol === 'https:'
        : false;
  }

  async begin(
    userId: string,
    sessionId: string,
  ): Promise<{
    authorizationUrl: string;
    browserNonce: string;
    secureCookie: boolean;
  }> {
    if (!this.google.available())
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message: 'Google Calendar sync is unavailable on this server.',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });

    const integration = await this.calendars.status(userId);
    if (integration?.status === 'disconnecting')
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Finish disconnecting Google Calendar before reconnecting it.',
        status: HttpStatus.CONFLICT,
      });

    const state = randomBytes(32).toString('base64url');
    const browserNonce = randomBytes(32).toString('base64url');
    const idTokenNonce = randomBytes(32).toString('base64url');
    const returnTo = this.returnUrl('pending').toString();

    await this.calendars.createOAuthRequest({
      userId,
      sessionId,
      stateHash: hash(state),
      browserNonceHash: hash(browserNonce),
      idTokenNonceHash: hash(idTokenNonce),
      returnTo,
      expiresInMs: OAUTH_REQUEST_TTL_MS,
    });

    return {
      authorizationUrl: this.google.authorizationUrl(state, idTokenNonce),
      browserNonce,
      secureCookie: this.cookieSecure,
    };
  }

  async callback(
    input: GoogleCalendarOAuthCallback,
  ): Promise<GoogleCalendarOAuthCallbackResult> {
    if (!input.state || !input.browserNonce)
      return {
        redirectUrl: this.returnUrl('failed').toString(),
        state: 'failed',
      };

    const request = await this.calendars.consumeOAuthRequest(
      hash(input.state),
      hash(input.browserNonce),
    );

    if (!request)
      return {
        redirectUrl: this.returnUrl('failed').toString(),
        state: 'failed',
      };
    if (input.providerError)
      return {
        redirectUrl: this.returnUrl('denied', request.returnTo).toString(),
        state: 'denied',
      };
    if (!input.code)
      return {
        redirectUrl: this.returnUrl('failed', request.returnTo).toString(),
        state: 'failed',
      };

    try {
      const tokens = await this.google.exchange(input.code);
      const identity = await this.google.verifyIdToken(tokens.idToken);
      if (!sameHash(hash(identity.nonce), request.idTokenNonceHash))
        throw new Error('Google ID token nonce did not match the request.');

      const scopes = new Set((tokens.scope ?? '').split(/\s+/).filter(Boolean));
      const hasCalendarScopes = REQUIRED_CALENDAR_SCOPES.every((scope) =>
        scopes.has(scope),
      );

      const hasEmailScope = [...EMAIL_SCOPES].some((scope) =>
        scopes.has(scope),
      );

      if (!hasCalendarScopes || !hasEmailScope)
        return {
          redirectUrl: this.returnUrl('failed', request.returnTo).toString(),
          state: 'failed',
        };

      const calendar = (
        await this.google.listCalendars(tokens.accessToken, {
          googleSubject: identity.subject,
          calendarId: null,
          lane: 'interactive',
        })
      ).find(({ primary, writable }) => primary && writable);

      if (!calendar)
        return {
          redirectUrl: this.returnUrl('failed', request.returnTo).toString(),
          state: 'failed',
        };

      const saved = await this.calendars.saveGoogleConnection({
        userId: request.userId,
        googleSubject: identity.subject,
        googleEmail: identity.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? '',
        calendar: {
          id: calendar.id,
          name: calendar.name,
          timezone: calendar.timezone,
        },
      });

      if (saved.status === 'needs_offline_consent')
        return {
          redirectUrl: this.returnUrl(
            'needs_offline_consent',
            request.returnTo,
          ).toString(),
          state: 'needs_offline_consent',
        };

      if (saved.status === 'disconnecting') {
        await this.revokeLateAuthorization(
          tokens.refreshToken ?? tokens.accessToken,
        );

        return {
          redirectUrl: this.returnUrl('failed', request.returnTo).toString(),
          state: 'failed',
        };
      }

      if (saved.status === 'user_missing')
        return {
          redirectUrl: this.returnUrl('failed', request.returnTo).toString(),
          state: 'failed',
        };

      await this.enqueueInitialSync(
        saved.bindingId,
        saved.connectionGeneration,
      );

      return {
        redirectUrl: this.returnUrl('connected', request.returnTo).toString(),
        state: 'connected',
      };
    } catch (error) {
      this.logger.error(
        'Google Calendar OAuth callback failed.',
        error instanceof Error ? error.stack : undefined,
      );

      return {
        redirectUrl: this.returnUrl('failed', request.returnTo).toString(),
        state: 'failed',
      };
    }
  }

  private async enqueueInitialSync(
    bindingId: string,
    connectionGeneration: number,
  ): Promise<void> {
    if (!this.queues) {
      this.logger.error(
        `Calendar binding ${bindingId} is ready for initial sync, but the queue is unavailable; recovery will enqueue it.`,
      );

      return;
    }

    try {
      await this.queues.calendarSync.add('calendar-initial-sync', {
        kind: 'pull',
        bindingId,
        connectionGeneration,
      });
    } catch (error) {
      this.logger.error(
        `Calendar binding ${bindingId} is ready for initial sync, but queue dispatch failed; recovery will enqueue it.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async disconnect(userId: string): Promise<CalendarDisconnectResult> {
    const preparation = await this.calendars.beginDisconnect(userId);
    if (preparation.connectionStatus === 'disconnected')
      return {
        connected: false,
        connectionStatus: 'disconnected',
        cleanupPending: false,
      };

    const credentials = await this.calendars.integrationCredentials(userId);
    let accessToken = credentials?.accessToken ?? null;

    if (
      this.google.available() &&
      preparation.channels.length > 0 &&
      credentials?.refreshToken &&
      (!credentials.expiresAt || credentials.expiresAt <= new Date())
    ) {
      try {
        const refreshed = await this.google.refresh(credentials.refreshToken);
        accessToken = refreshed.accessToken;
        await this.calendars.updateAccessToken(
          userId,
          refreshed.accessToken,
          refreshed.expiresAt,
        );
      } catch (error) {
        calendarSyncMetrics.recordRefreshFailure();
        this.logger.warn(
          `Google Calendar access token could not be refreshed while disconnecting user ${userId}; watch cleanup will wait for channel expiry.`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (this.google.available() && accessToken && credentials?.googleSubject) {
      for (const channel of preparation.channels) {
        if (!channel.resourceId) {
          await this.calendars.markWatchCleanupPending(channel.channelId);
          this.logger.warn(
            `Google Calendar watch ${channel.channelId} has no resource ID during disconnect; the locally fenced channel will expire remotely.`,
          );

          continue;
        }

        try {
          await this.google.stopWatch(
            accessToken,
            channel.channelId,
            channel.resourceId,
            {
              googleSubject: credentials.googleSubject,
              calendarId: credentials.calendarId,
              lane: 'watch',
            },
          );
          await this.calendars.markWatchChannelStopped(channel.channelId);
        } catch (error) {
          await this.calendars.markWatchCleanupPending(channel.channelId);
          calendarSyncMetrics.recordCleanupFailure();
          this.logger.warn(
            `Google Calendar watch ${channel.channelId} could not be stopped during disconnect; incoming notifications remain locally fenced while the channel expires.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } else if (preparation.channels.length > 0) {
      const reason = !this.google.available()
        ? 'Google Calendar sync is disabled on this server'
        : !accessToken
          ? 'a usable access token is unavailable'
          : 'the verified Google subject is missing';

      this.logger.warn(
        `Google Calendar watch channels for user ${userId} could not be stopped during disconnect because ${reason}; locally fenced channels will expire remotely.`,
      );
    }

    const token = credentials?.refreshToken ?? credentials?.accessToken;

    if (token) {
      try {
        await this.google.revoke(token);
      } catch (error) {
        calendarSyncMetrics.recordTokenRevocationFailure();
        this.logger.warn(
          `Google Calendar authorization could not be revoked for user ${userId}; sync remains suspended and encrypted credentials are retained for retry.`,
          error instanceof Error ? error.stack : undefined,
        );

        return {
          connected: false,
          connectionStatus: 'disconnecting',
          cleanupPending: true,
        };
      }
    }

    await this.calendars.disconnect(userId);

    return {
      connected: false,
      connectionStatus: 'disconnected',
      cleanupPending: false,
    };
  }

  private async revokeLateAuthorization(token: string): Promise<void> {
    try {
      await this.google.revoke(token);
    } catch (error) {
      calendarSyncMetrics.recordTokenRevocationFailure();
      this.logger.warn(
        'Google Calendar authorization issued during a concurrent disconnect could not be revoked.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private returnUrl(
    state: GoogleCalendarOAuthCallbackResult['state'] | 'pending',
    savedUrl?: string,
  ): URL {
    const url = savedUrl
      ? new URL(savedUrl)
      : new URL('/settings', this.frontendUrl);

    if (url.origin !== this.frontendUrl.origin)
      throw new Error('Stored Google Calendar return URL is not allowlisted.');

    url.searchParams.set('tab', 'integrations');
    if (state === 'pending') url.searchParams.delete('googleCalendar');
    else url.searchParams.set('googleCalendar', state);

    return url;
  }
}
