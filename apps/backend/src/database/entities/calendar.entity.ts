import type {
  CalendarEvent as PrismaCalendarEvent,
  CalendarIntegration as PrismaCalendarIntegration,
} from '../../generated/prisma/client';

export type CalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type CalendarEventSyncState =
  'local' | 'pending' | 'synced' | 'conflict' | 'error' | 'reconnect_required';

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
  | 'allDayStartDate'
  | 'allDayEndDate'
  | 'recurrence'
  | 'recurrenceOverrideFields'
  | 'recurringParentProviderEventId'
  | 'recurringParentEventId'
  | 'recurrenceExceptionKey'
  | 'originalStartAt'
  | 'originalStartDate'
  | 'attendees'
  | 'status'
  | 'syncState'
  | 'revision'
  | 'lastSyncedAt'
  | 'syncErrorCode'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: CalendarEventStatus;
  syncState: CalendarEventSyncState;
  googleMeetUrl?: string | null;
  googleMeetStatus?: 'pending' | 'success' | 'failure' | null;
};

// Read identity comes from the authoritative link; legacy unlinked rows have none.
export type CalendarEventForRead = CalendarEvent & {
  providerBindingId: string | null;
};

type CalendarEventCommonWrite = {
  title: string;
  description?: string | null;
  location?: string | null;
  recurrence?: string[];
  createGoogleMeet?: boolean;
  attendees?: string[];
  status?: Exclude<CalendarEventStatus, 'cancelled'>;
};

export type CalendarTimedEventWrite = CalendarEventCommonWrite & {
  startAt: Date;
  endAt: Date;
  timezone: string;
  allDayStartDate?: never;
  allDayEndDate?: never;
};

export type CalendarAllDayEventWrite = CalendarEventCommonWrite & {
  allDayStartDate: Date;
  allDayEndDate: Date;
  timezone?: string | null;
  startAt?: never;
  endAt?: never;
};

export type CalendarEventWrite =
  CalendarTimedEventWrite | CalendarAllDayEventWrite;

export type CalendarIntegration = Pick<
  PrismaCalendarIntegration,
  | 'id'
  | 'provider'
  | 'status'
  | 'accessTokenExpiresAt'
  | 'scope'
  | 'calendarId'
  | 'googleEmail'
  | 'connectionGeneration'
  | 'activeBindingId'
  | 'updatedAt'
>;
