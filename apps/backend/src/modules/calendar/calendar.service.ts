import { Inject, Injectable } from '@nestjs/common';
import type { CalendarEvent, CalendarEventWrite } from '../../database/entities';
import { CALENDAR_REPOSITORY, type ICalendarRepository } from '../../database/interfaces';
import { GoogleCalendarService } from '../../infra/calendar';

@Injectable()
export class CalendarService {
  constructor(@Inject(CALENDAR_REPOSITORY) private readonly calendars: ICalendarRepository, private readonly google: GoogleCalendarService) {}
  async create(userId: string, input: CalendarEventWrite): Promise<CalendarEvent> {
    const credentials = await this.credentials(userId);
    if (!credentials) return this.calendars.create(userId, input);
    const providerEventId = await this.google.createEvent(credentials.accessToken, credentials.calendarId, input);
    return this.calendars.create(userId, { ...input, provider: 'google', providerEventId });
  }
  async update(userId: string, id: string, input: Partial<CalendarEventWrite>): Promise<CalendarEvent | null> {
    const existing = await this.calendars.findById(userId, id);
    if (!existing) return null;
    if (existing.provider === 'google' && existing.providerEventId) { const credentials = await this.credentials(userId); if (!credentials) throw new Error('Google Calendar tidak terhubung.'); await this.google.updateEvent(credentials.accessToken, credentials.calendarId, existing.providerEventId, input); }
    return this.calendars.update(userId, id, input);
  }
  async cancel(userId: string, id: string): Promise<CalendarEvent | null> {
    const existing = await this.calendars.findById(userId, id);
    if (!existing) return null;
    if (existing.provider === 'google' && existing.providerEventId) { const credentials = await this.credentials(userId); if (!credentials) throw new Error('Google Calendar tidak terhubung.'); await this.google.deleteEvent(credentials.accessToken, credentials.calendarId, existing.providerEventId); }
    return this.calendars.update(userId, id, { status: 'cancelled' });
  }
  private async credentials(userId: string): Promise<{ accessToken: string; calendarId: string } | null> {
    const stored = await this.calendars.integrationCredentials(userId);
    if (stored === null || stored === undefined) return null;
    if (!stored.accessToken) return null;
    if (!stored.expiresAt) return null;
    const expired = stored.expiresAt.getTime() <= Date.now() + 30_000;
    if (!expired) return { accessToken: stored.accessToken, calendarId: stored.calendarId ?? 'primary' };
    if (!stored.refreshToken) return null;
    const refreshed = await this.google.refresh(stored.refreshToken);
    await this.calendars.updateAccessToken(userId, refreshed.accessToken, refreshed.expiresAt);
    return { accessToken: refreshed.accessToken, calendarId: stored.calendarId ?? 'primary' };
  }
}
