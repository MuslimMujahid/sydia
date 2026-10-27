import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { CalendarEventWrite } from '../../database/entities';
import {
  GoogleCalendarRequestLimiter,
  type GoogleCalendarRequestContext,
} from './google-calendar-request-limiter.service';
import {
  calendarSyncMetrics,
  type CalendarProviderMethod,
  type CalendarProviderRequestOutcome,
} from './calendar-sync.metrics';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_LIST_SCOPE =
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

const REQUEST_TIMEOUT_MS = 15_000;

export type GoogleOAuthIdentity = {
  subject: string;
  email: string;
  emailVerified: true;
  nonce: string;
};

export type GoogleCalendarSummary = {
  id: string;
  name: string;
  timezone: string;
  primary: boolean;
  writable: boolean;
};

export type GoogleEventResource = Record<string, unknown>;

export type GoogleEventPage = {
  items: GoogleEventResource[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
};

export class GoogleCalendarApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly providerReason: string,
    readonly retryAfterMs: number | null,
  ) {
    super(`Google Calendar API request failed (${httpStatus}).`);
    this.name = 'GoogleCalendarApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new GoogleCalendarApiError(502, `missing_${field}`, null);

  return value;
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const at = Date.parse(value);

  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

function googleReason(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error)) return 'unknown';
  const details = value.error.errors;
  const first: unknown = Array.isArray(details) ? details[0] : null;

  return isRecord(first) && typeof first.reason === 'string'
    ? first.reason
    : typeof value.error.status === 'string'
      ? value.error.status
      : 'unknown';
}

@Injectable()
export class GoogleCalendarService {
  private readonly syncEnabled: boolean;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri?: string;
  private readonly idTokenVerifier = new OAuth2Client();

  constructor(
    config: ConfigService,
    private readonly requestLimiter: GoogleCalendarRequestLimiter,
  ) {
    const enabledValue = (
      config.get<string>('BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED', 'false') ??
      'false'
    )
      .trim()
      .toLowerCase();

    if (enabledValue !== 'true' && enabledValue !== 'false')
      throw new Error(
        'BACKEND_GOOGLE_CALENDAR_SYNC_ENABLED must be true or false.',
      );

    this.syncEnabled = enabledValue === 'true';
    this.clientId = config.get<string>('BACKEND_GOOGLE_CLIENT_ID')?.trim();
    this.clientSecret = config
      .get<string>('BACKEND_GOOGLE_CLIENT_SECRET')
      ?.trim();
    this.redirectUri = config
      .get<string>('BACKEND_GOOGLE_REDIRECT_URI')
      ?.trim();

    if (this.syncEnabled) {
      const missing = [
        !this.clientId ? 'BACKEND_GOOGLE_CLIENT_ID' : null,
        !this.clientSecret ? 'BACKEND_GOOGLE_CLIENT_SECRET' : null,
        !this.redirectUri ? 'BACKEND_GOOGLE_REDIRECT_URI' : null,
      ].filter((value): value is string => value !== null);

      if (missing.length > 0)
        throw new Error(
          `Google Calendar sync is enabled but required configuration is missing: ${missing.join(', ')}.`,
        );

      let redirectUrl: URL;

      try {
        redirectUrl = new URL(this.redirectUri!);
      } catch {
        throw new Error(
          'BACKEND_GOOGLE_REDIRECT_URI must be a valid absolute URL.',
        );
      }

      if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:')
        throw new Error('BACKEND_GOOGLE_REDIRECT_URI must use HTTP or HTTPS.');
    }
  }

  available(): boolean {
    return (
      this.syncEnabled &&
      Boolean(this.clientId && this.clientSecret && this.redirectUri)
    );
  }

  authorizationUrl(state: string, nonce: string): string {
    this.requireConfig();
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri!,
      response_type: 'code',
      scope: `openid email ${CALENDAR_SCOPE} ${CALENDAR_LIST_SCOPE}`,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
      nonce,
    });

    return `${AUTH_URL}?${params}`;
  }

  async exchange(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    idToken: string;
    expiresAt: Date;
    scope?: string;
  }> {
    this.requireConfig();
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.redirectUri!,
        grant_type: 'authorization_code',
        code,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload = await this.json(response);
    if (
      typeof payload.access_token !== 'string' ||
      typeof payload.id_token !== 'string' ||
      typeof payload.expires_in !== 'number'
    )
      throw new GoogleCalendarApiError(502, 'invalid_token_response', null);

    return {
      accessToken: payload.access_token,
      idToken: payload.id_token,
      ...(typeof payload.refresh_token === 'string'
        ? { refreshToken: payload.refresh_token }
        : {}),
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
      ...(typeof payload.scope === 'string' ? { scope: payload.scope } : {}),
    };
  }

  async verifyIdToken(idToken: string): Promise<GoogleOAuthIdentity> {
    this.requireConfig();
    const ticket = await this.idTokenVerifier.verifyIdToken({
      idToken,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      payload.email_verified !== true ||
      typeof payload.nonce !== 'string'
    )
      throw new Error('Google account identity is incomplete or unverified.');

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: true,
      nonce: payload.nonce,
    };
  }

  async refresh(
    refreshToken: string,
    beforeRequest?: () => Promise<void>,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    this.requireConfig();
    await beforeRequest?.();
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload = await this.json(response);
    if (
      typeof payload.access_token !== 'string' ||
      typeof payload.expires_in !== 'number'
    )
      throw new GoogleCalendarApiError(502, 'invalid_refresh_response', null);

    return {
      accessToken: payload.access_token,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    };
  }

  async listCalendars(
    token: string,
    context: GoogleCalendarRequestContext,
  ): Promise<GoogleCalendarSummary[]> {
    const calendars: GoogleCalendarSummary[] = [];
    let pageToken: string | null = null;

    do {
      const query = new URLSearchParams({ maxResults: '250' });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await this.calendar(
        token,
        `/users/me/calendarList?${query}`,
        'GET',
        undefined,
        undefined,
        context,
      );

      if (!Array.isArray(page.items))
        throw new GoogleCalendarApiError(502, 'invalid_calendar_list', null);

      for (const item of page.items) {
        if (!isRecord(item))
          throw new GoogleCalendarApiError(502, 'invalid_calendar_entry', null);
        calendars.push({
          id: requiredString(item.id, 'calendar_id'),
          name:
            typeof item.summary === 'string'
              ? item.summary
              : 'Untitled calendar',
          timezone:
            typeof item.timeZone === 'string' && item.timeZone
              ? item.timeZone
              : 'UTC',
          primary: item.primary === true,
          writable: item.accessRole === 'owner' || item.accessRole === 'writer',
        });
      }

      pageToken =
        typeof page.nextPageToken === 'string' ? page.nextPageToken : null;
    } while (pageToken);

    return calendars;
  }

  async listEvents(
    token: string,
    calendarId: string,
    input: { pageToken?: string | null; syncToken?: string | null },
    context: GoogleCalendarRequestContext,
  ): Promise<GoogleEventPage> {
    const query = new URLSearchParams({
      singleEvents: 'false',
      showDeleted: 'true',
      eventTypes: 'default',
      maxResults: '250',
    });

    if (input.pageToken) query.set('pageToken', input.pageToken);
    if (input.syncToken) query.set('syncToken', input.syncToken);

    const payload = await this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      'GET',
      undefined,
      undefined,
      context,
    );

    if (!Array.isArray(payload.items))
      throw new GoogleCalendarApiError(502, 'invalid_event_page', null);

    return {
      items: payload.items.map((item) => {
        if (!isRecord(item))
          throw new GoogleCalendarApiError(502, 'invalid_event_resource', null);

        return item;
      }),
      nextPageToken:
        typeof payload.nextPageToken === 'string'
          ? payload.nextPageToken
          : null,
      nextSyncToken:
        typeof payload.nextSyncToken === 'string'
          ? payload.nextSyncToken
          : null,
    };
  }

  async getEvent(
    token: string,
    calendarId: string,
    eventId: string,
    context: GoogleCalendarRequestContext,
  ): Promise<GoogleEventResource> {
    return this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      'GET',
      undefined,
      undefined,
      context,
    );
  }

  async listEventInstances(
    token: string,
    calendarId: string,
    masterEventId: string,
    originalStart: string,
    context: GoogleCalendarRequestContext,
  ): Promise<GoogleEventResource[]> {
    const query = new URLSearchParams({
      originalStart,
      maxResults: '250',
      showDeleted: 'true',
    });

    const page = await this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(masterEventId)}/instances?${query}`,
      'GET',
      undefined,
      undefined,
      context,
    );

    if (!Array.isArray(page.items))
      throw new GoogleCalendarApiError(502, 'invalid_event_instances', null);

    return page.items.map((item) => {
      if (!isRecord(item))
        throw new GoogleCalendarApiError(502, 'invalid_event_instance', null);

      return item;
    });
  }

  async createEvent(
    token: string,
    calendarId: string,
    eventId: string,
    operationId: string,
    input: CalendarEventWrite,
    context: GoogleCalendarRequestContext,
    sendUpdates?: 'all' | 'none',
  ): Promise<GoogleEventResource> {
    const body = this.eventBody(input);
    body.id = eventId;
    this.setConferenceRequest(body, input.createGoogleMeet, operationId);
    body.extendedProperties = {
      private: { sydiaOperationId: operationId },
    };
    // Google only emails invitations when the create request asks for it, so a
    // new event that already has attendees defaults to notifying them.
    const notify =
      sendUpdates ?? (input.attendees?.length ? 'all' : ('none' as const));

    return this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${notify}&conferenceDataVersion=1`,
      'POST',
      body,
      undefined,
      context,
    );
  }

  async updateEvent(
    token: string,
    calendarId: string,
    eventId: string,
    operationId: string,
    input: Partial<CalendarEventWrite>,
    etag: string | null,
    context: GoogleCalendarRequestContext,
    sendUpdates: 'all' | 'none' = 'all',
  ): Promise<GoogleEventResource> {
    if (!etag)
      throw new Error('A Google event update requires a current ETag.');
    const body = this.eventBody(input);
    body.extendedProperties = { private: { sydiaOperationId: operationId } };
    this.setConferenceRequest(body, input.createGoogleMeet, operationId);

    return this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}&conferenceDataVersion=1`,
      'PATCH',
      body,
      { 'If-Match': etag },
      context,
    );
  }

  async deleteEvent(
    token: string,
    calendarId: string,
    eventId: string,
    etag: string | null,
    context: GoogleCalendarRequestContext,
    sendUpdates: 'all' | 'none' = 'all',
  ): Promise<void> {
    await this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
      'DELETE',
      undefined,
      etag ? { 'If-Match': etag } : undefined,
      context,
    );
  }

  async watchEvents(
    token: string,
    calendarId: string,
    input: {
      channelId: string;
      channelToken: string;
      address: string;
      expiration: number;
    },
    context: GoogleCalendarRequestContext,
  ): Promise<{
    resourceId: string;
    resourceUri: string | null;
    expiration: Date | null;
  }> {
    const payload = await this.calendar(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      'POST',
      {
        id: input.channelId,
        type: 'web_hook',
        address: input.address,
        token: input.channelToken,
        expiration: String(input.expiration),
      },
      undefined,
      context,
    );

    return {
      resourceId: requiredString(payload.resourceId, 'resource_id'),
      resourceUri:
        typeof payload.resourceUri === 'string' ? payload.resourceUri : null,
      expiration:
        typeof payload.expiration === 'string' ||
        typeof payload.expiration === 'number'
          ? new Date(Number(payload.expiration))
          : null,
    };
  }

  async stopWatch(
    token: string,
    channelId: string,
    resourceId: string,
    context: GoogleCalendarRequestContext,
  ): Promise<void> {
    await this.calendar(
      token,
      '/channels/stop',
      'POST',
      {
        id: channelId,
        resourceId,
      },
      undefined,
      context,
    );
  }

  async revoke(token: string): Promise<void> {
    const response = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok && response.status !== 400)
      throw new GoogleCalendarApiError(
        response.status,
        'revoke_failed',
        retryAfterMs(response),
      );
  }

  private setConferenceRequest(
    body: GoogleEventResource,
    enabled: boolean | undefined,
    operationId: string,
  ): void {
    if (enabled === undefined) return;
    body.conferenceData = enabled
      ? {
          createRequest: {
            requestId: operationId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      : null;
  }

  private eventBody(
    input: Partial<CalendarEventWrite>,
  ): Record<string, unknown> {
    let start: Record<string, string> | undefined;
    let end: Record<string, string> | undefined;

    if (input.startAt || input.endAt) {
      if (!input.startAt || !input.endAt || !input.timezone)
        throw new Error(
          'A timed Google event requires both dates and a timezone.',
        );
      start = {
        dateTime: input.startAt.toISOString(),
        timeZone: input.timezone,
      };
      end = { dateTime: input.endAt.toISOString(), timeZone: input.timezone };
    } else if (input.allDayStartDate || input.allDayEndDate) {
      if (!input.allDayStartDate || !input.allDayEndDate)
        throw new Error(
          'An all-day Google event requires both calendar dates.',
        );
      start = { date: input.allDayStartDate.toISOString().slice(0, 10) };
      end = { date: input.allDayEndDate.toISOString().slice(0, 10) };
    }

    return {
      ...(input.title !== undefined ? { summary: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? '' }
        : {}),
      ...(input.location !== undefined
        ? { location: input.location ?? '' }
        : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(input.recurrence !== undefined
        ? { recurrence: input.recurrence }
        : {}),
      ...(input.attendees !== undefined
        ? { attendees: input.attendees.map((email) => ({ email })) }
        : {}),
    };
  }

  private async calendar(
    token: string,
    path: string,
    method: CalendarProviderMethod,
    body: Record<string, unknown> | undefined,
    extraHeaders: Record<string, string> | undefined,
    context: GoogleCalendarRequestContext,
  ): Promise<Record<string, unknown>> {
    this.requireConfig();
    const admissionStartedAt = performance.now();
    let lease: Awaited<ReturnType<GoogleCalendarRequestLimiter['acquire']>>;

    try {
      lease = await this.requestLimiter.acquire(context);
    } catch (error) {
      calendarSyncMetrics.recordAdmissionWait(
        context.lane,
        performance.now() - admissionStartedAt,
      );
      throw error;
    }

    calendarSyncMetrics.recordAdmissionWait(
      context.lane,
      performance.now() - admissionStartedAt,
    );

    try {
      await context.beforeRequest?.();
      const requestStartedAt = performance.now();
      let outcome: CalendarProviderRequestOutcome = 'success';

      try {
        const response = await fetch(`${CALENDAR_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...extraHeaders,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (method === 'DELETE' && response.ok) return {};

        return await this.json(response);
      } catch (error) {
        outcome =
          error instanceof GoogleCalendarApiError
            ? 'provider_error'
            : 'transport_error';
        throw error;
      } finally {
        calendarSyncMetrics.recordProviderRequest(
          method,
          context.lane,
          outcome,
          performance.now() - requestStartedAt,
        );
      }
    } finally {
      await this.requestLimiter.release(lease);
    }
  }

  private async json(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    let value: unknown = null;

    if (text) {
      try {
        value = JSON.parse(text) as unknown;
      } catch {
        if (response.ok)
          throw new GoogleCalendarApiError(502, 'invalid_json_response', null);
      }
    }

    if (!response.ok)
      throw new GoogleCalendarApiError(
        response.status,
        googleReason(value),
        retryAfterMs(response),
      );
    if (!isRecord(value))
      throw new GoogleCalendarApiError(502, 'invalid_response_shape', null);

    return value;
  }

  private requireConfig(): void {
    if (!this.syncEnabled)
      throw new Error('Google Calendar sync is disabled on this server.');
    if (!this.clientId || !this.clientSecret || !this.redirectUri)
      throw new Error('Google Calendar OAuth configuration is incomplete.');
  }
}
