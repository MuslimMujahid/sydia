import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CalendarEventWrite } from '../../database/entities';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
@Injectable()
export class GoogleCalendarService {
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri?: string;
  private readonly stateSecret: string;
  constructor(config: ConfigService) {
    this.clientId = config.get<string>('BACKEND_GOOGLE_CLIENT_ID');
    this.clientSecret = config.get<string>('BACKEND_GOOGLE_CLIENT_SECRET');
    this.redirectUri = config.get<string>('BACKEND_GOOGLE_REDIRECT_URI');
    this.stateSecret = config.get<string>(
      'BACKEND_AUTH_SECRET',
      'development-only-secret',
    );
  }

  available(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  authorizationUrl(userId: string): string {
    this.requireConfig();
    const timestamp = Date.now().toString();
    const value = `${userId}.${timestamp}`;
    const signature = createHmac('sha256', this.stateSecret)
      .update(value)
      .digest('base64url');

    const state = Buffer.from(`${value}.${signature}`).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri!,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });

    return `${AUTH_URL}?${params}`;
  }

  verifyState(state: string): string | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString();
      const [userId, timestamp, signature] = decoded.split('.');
      if (
        !userId ||
        !timestamp ||
        !signature ||
        Date.now() - Number(timestamp) > 10 * 60_000
      )
        return null;
      const expected = createHmac('sha256', this.stateSecret)
        .update(`${userId}.${timestamp}`)
        .digest();

      const received = Buffer.from(signature, 'base64url');

      return expected.length === received.length &&
        timingSafeEqual(expected, received)
        ? userId
        : null;
    } catch {
      return null;
    }
  }

  async exchange(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
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
    });

    const payload = await this.json(response);
    if (
      typeof payload.access_token !== 'string' ||
      typeof payload.expires_in !== 'number'
    )
      throw new Error('Token Google tidak valid.');

    return {
      accessToken: payload.access_token,
      ...(typeof payload.refresh_token === 'string'
        ? { refreshToken: payload.refresh_token }
        : {}),
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
      ...(typeof payload.scope === 'string' ? { scope: payload.scope } : {}),
    };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    this.requireConfig();
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const payload = await this.json(response);
    if (
      typeof payload.access_token !== 'string' ||
      typeof payload.expires_in !== 'number'
    )
      throw new Error('Refresh token Google tidak valid.');

    return {
      accessToken: payload.access_token,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    input: CalendarEventWrite,
  ): Promise<string> {
    const payload = await this.calendar(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      'POST',
      this.eventBody(input),
    );

    if (typeof payload.id !== 'string')
      throw new Error('Google tidak mengembalikan ID event.');

    return payload.id;
  }

  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    input: Partial<CalendarEventWrite>,
  ): Promise<void> {
    await this.calendar(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      'PATCH',
      this.eventBody(input),
    );
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    await this.calendar(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      'DELETE',
    );
  }

  async revoke(token: string): Promise<void> {
    const response = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });

    if (!response.ok && response.status !== 400)
      throw new Error('Pencabutan akses Google gagal.');
  }

  private eventBody(
    input: Partial<CalendarEventWrite>,
  ): Record<string, unknown> {
    return {
      ...(input.title !== undefined ? { summary: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.startAt
        ? {
            start: {
              dateTime: input.startAt.toISOString(),
              timeZone: input.timezone,
            },
          }
        : {}),
      ...(input.endAt
        ? {
            end: {
              dateTime: input.endAt.toISOString(),
              timeZone: input.timezone,
            },
          }
        : {}),
      ...(input.attendees
        ? { attendees: input.attendees.map((email) => ({ email })) }
        : {}),
    };
  }

  private async calendar(
    token: string,
    path: string,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${CALENDAR_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (method === 'DELETE' && response.ok) return {};

    return this.json(response);
  }

  private async json(response: Response): Promise<Record<string, unknown>> {
    const value: unknown = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(`Google API mengembalikan ${response.status}.`);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Respons Google tidak valid.');

    return value as Record<string, unknown>;
  }

  private requireConfig(): void {
    if (!this.available())
      throw new Error('Integrasi Google Calendar belum dikonfigurasi.');
  }
}
