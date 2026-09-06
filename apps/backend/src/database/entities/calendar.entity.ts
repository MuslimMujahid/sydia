import type {
  CalendarEvent as PrismaCalendarEvent,
  CalendarIntegration as PrismaCalendarIntegration,
} from '../../generated/prisma/client';

export type CalendarEventStatus = 'confirmed' | 'cancelled';
export type CalendarEvent = Pick<
  PrismaCalendarEvent,
  | 'id'
  | 'provider'
  | 'providerEventId'
  | 'title'
  | 'description'
  | 'location'
  | 'startAt'
  | 'endAt'
  | 'timezone'
  | 'attendees'
  | 'createdAt'
  | 'updatedAt'
> & { status: CalendarEventStatus };

export type CalendarEventWrite = {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendees?: string[];
};

export type CalendarIntegration = Pick<
  PrismaCalendarIntegration,
  | 'id'
  | 'provider'
  | 'status'
  | 'accessTokenExpiresAt'
  | 'scope'
  | 'calendarId'
  | 'updatedAt'
>;
