import type { CalendarEvent, CalendarEventWrite, CalendarIntegration } from '../entities';

export interface ICalendarRepository {
  status(userId: string): Promise<CalendarIntegration | null>;
  integrationCredentials(userId: string): Promise<{ accessToken: string | null; refreshToken: string | null; expiresAt: Date | null; calendarId: string | null } | null>;
  saveIntegration(userId: string, input: { accessToken: string; refreshToken?: string | null; expiresAt: Date; scope?: string | null }): Promise<void>;
  updateAccessToken(userId: string, accessToken: string, expiresAt: Date): Promise<void>;
  disconnect(userId: string): Promise<void>;
  list(userId: string, from: Date, to: Date): Promise<CalendarEvent[]>;
  findById(userId: string, id: string): Promise<CalendarEvent | null>;
  create(userId: string, input: CalendarEventWrite & { provider?: string; providerEventId?: string | null }): Promise<CalendarEvent>;
  update(userId: string, id: string, input: Partial<CalendarEventWrite> & { provider?: string; providerEventId?: string | null; status?: 'confirmed' | 'cancelled' }): Promise<CalendarEvent | null>;
}
export const CALENDAR_REPOSITORY = Symbol('ICalendarRepository');
