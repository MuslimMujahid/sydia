import { Inject, Injectable } from '@nestjs/common';
import { RRule, RRuleSet } from 'rrule';
import type {
  CalendarEvent,
  CalendarEventForRead,
} from '../../database/entities';
import {
  CALENDAR_REPOSITORY,
  type ICalendarRepository,
} from '../../database/interfaces';
import { zonedInstant, zonedParts } from '../../shared/date-time/timezone-day';

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_QUERY = 5_000;
const MAX_OCCURRENCES_PER_SERIES = 2_000;
const MAX_OCCURRENCES_PER_QUERY = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarEventOccurrence = CalendarEvent & {
  sourceEventId: string;
  seriesEventId: string | null;
  occurrenceKey: string | null;
  isOccurrence: boolean;
  instanceEventId: string | null;
};

export class CalendarReadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarReadLimitError';
  }
}

export type CalendarReadRepository = Pick<
  ICalendarRepository,
  | 'list'
  | 'listCancelledRecurringInstances'
  | 'findById'
  | 'materializeLocalOccurrence'
>;

function googleSeriesKey(bindingId: string, providerEventId: string): string {
  return JSON.stringify(['google', bindingId, providerEventId]);
}

function seriesKey(event: CalendarEventForRead): string {
  if (event.provider === 'local') return `local:${event.id}`;
  if (event.providerBindingId && event.providerEventId)
    return googleSeriesKey(event.providerBindingId, event.providerEventId);

  // Legacy rows have no verified provider identity. Expand their own series,
  // but never combine them with another legacy row or a verified binding.
  return `unlinked:${event.id}`;
}

function exceptionParentKey(
  event: CalendarEventForRead,
  parent?: CalendarEventForRead,
): string | null {
  if (parent) return seriesKey(parent);
  if (event.recurringParentEventId)
    return `local:${event.recurringParentEventId}`;
  if (event.providerBindingId && event.recurringParentProviderEventId)
    return googleSeriesKey(
      event.providerBindingId,
      event.recurringParentProviderEventId,
    );

  return null;
}

function occurrenceRange(
  occurrenceKey: string,
): { from: Date; to: Date } | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(occurrenceKey);
  const start = dateOnly
    ? new Date(`${occurrenceKey}T00:00:00.000Z`)
    : new Date(occurrenceKey);

  if (
    !Number.isFinite(start.getTime()) ||
    (dateOnly && start.toISOString().slice(0, 10) !== occurrenceKey) ||
    (!dateOnly && start.toISOString() !== occurrenceKey)
  )
    return null;

  const from = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );

  return { from, to: new Date(from.getTime() + DAY_MS) };
}

function utcWallClock(value: Date, timezone: string): Date {
  const parts = zonedParts(value, timezone);

  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
}

function wallClockInstant(value: Date, timezone: string): Date {
  return zonedInstant(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds(),
    },
    timezone,
  );
}

function compactDate(value: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(
    value,
  );

  if (!match) throw new Error(`Unsupported Google recurrence date: ${value}`);

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const result = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  if (
    result.getUTCFullYear() !== Number(year) ||
    result.getUTCMonth() !== Number(month) - 1 ||
    result.getUTCDate() !== Number(day) ||
    result.getUTCHours() !== Number(hour) ||
    result.getUTCMinutes() !== Number(minute) ||
    result.getUTCSeconds() !== Number(second)
  )
    throw new Error(`Invalid Google recurrence date: ${value}`);

  return result;
}

function recurrenceSet(
  event: CalendarEvent,
  dtstart: Date,
): {
  set: RRuleSet;
  additionalInstants: Date[];
  excludedInstants: Set<number>;
  utcUntilRules: Array<{ rule: RRule; until: Date }>;
} {
  const set = new RRuleSet(true);
  const additionalInstants: Date[] = [];
  const excludedInstants = new Set<number>();
  const utcUntilRules: Array<{ rule: RRule; until: Date }> = [];
  const allDay = event.allDayStartDate !== null;
  set.rdate(dtstart);

  for (const entry of event.recurrence) {
    const separator = entry.indexOf(':');
    if (separator < 1 || separator === entry.length - 1)
      throw new Error(
        'Google Calendar returned an invalid recurrence component.',
      );

    const name = entry.slice(0, separator).split(';', 1)[0]?.toUpperCase();
    const value = entry.slice(separator + 1);

    if (name === 'RRULE') {
      const options = RRule.parseString(value);
      if (
        !allDay &&
        options.until &&
        /(?:^|;)UNTIL=\d{8}T\d{6}Z(?:;|$)/i.test(value)
      ) {
        const until = options.until;
        // A UTC cutoff must be compared after projection. During a DST
        // overlap, wall-clock ordering differs from instant ordering.
        utcUntilRules.push({
          rule: new RRule({ ...options, until: null, dtstart }),
          until,
        });
      } else set.rrule(new RRule({ ...options, dtstart }));
      continue;
    }

    if (name !== 'RDATE' && name !== 'EXDATE')
      throw new Error(
        `Unsupported Google recurrence component: ${name ?? 'unknown'}`,
      );

    const dateTimezone = /(?:^|;)TZID=([^;]+)/i.exec(
      entry.slice(0, separator),
    )?.[1];

    for (const item of value.split(',')) {
      const date = compactDate(item);
      if (!allDay && (item.endsWith('Z') || dateTimezone)) {
        // Explicit dates are instants, not floating series wall times. Keep
        // their identity even when a DST overlap has two equal wall times.
        const instant = item.endsWith('Z')
          ? date
          : wallClockInstant(date, dateTimezone!);

        if (name === 'RDATE') additionalInstants.push(instant);
        else excludedInstants.add(instant.getTime());
      } else if (name === 'RDATE') set.rdate(date);
      else set.exdate(date);
    }
  }

  return { set, additionalInstants, excludedInstants, utcUntilRules };
}

function occurrenceIdentity(event: CalendarEvent, date: Date): string {
  return event.allDayStartDate
    ? date.toISOString().slice(0, 10)
    : date.toISOString();
}

function exceptionIdentity(event: CalendarEvent): string | null {
  if (event.originalStartAt) return event.originalStartAt.toISOString();
  if (event.originalStartDate)
    return event.originalStartDate.toISOString().slice(0, 10);

  return null;
}

function occurrenceId(seriesId: string, identity: string): string {
  return `occurrence:${seriesId}:${encodeURIComponent(identity)}`;
}

function asOccurrence(
  event: CalendarEvent,
  series: CalendarEvent,
  identity: string,
  startAt: Date | null,
  endAt: Date | null,
  allDayStartDate: Date | null,
  allDayEndDate: Date | null,
  instanceEventId: string | null,
): CalendarEventOccurrence {
  const isLocalException = event.recurringParentEventId === series.id;
  const overrides = new Set(
    isLocalException ? event.recurrenceOverrideFields : [],
  );

  const inheritsTime = isLocalException && !overrides.has('time');

  return {
    ...event,
    title:
      isLocalException && !overrides.has('title') ? series.title : event.title,
    description:
      isLocalException && !overrides.has('description')
        ? series.description
        : event.description,
    location:
      isLocalException && !overrides.has('location')
        ? series.location
        : event.location,
    attendees:
      isLocalException && !overrides.has('attendees')
        ? series.attendees
        : event.attendees,
    status:
      isLocalException && !overrides.has('status')
        ? series.status
        : event.status,
    reminderMinutes:
      isLocalException && !overrides.has('reminderMinutes')
        ? series.reminderMinutes
        : (event.reminderMinutes ?? series.reminderMinutes),
    id: occurrenceId(series.id, identity),
    startAt,
    endAt,
    timezone: inheritsTime
      ? series.allDayStartDate
        ? series.timezone
        : (series.timezone ?? 'UTC')
      : event.timezone,
    allDayStartDate,
    allDayEndDate,
    recurrence: [],
    sourceEventId: series.id,
    seriesEventId: series.id,
    occurrenceKey: identity,
    isOccurrence: true,
    instanceEventId,
  };
}

function sortStart(event: CalendarEventOccurrence): number {
  return (event.startAt ?? event.allDayStartDate)?.getTime() ?? 0;
}

@Injectable()
export class CalendarReadService {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: CalendarReadRepository,
  ) {}

  async list(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEventOccurrence[]> {
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from
    )
      throw new Error(
        'Calendar read range must be a valid increasing date range.',
      );
    if (to.getTime() - from.getTime() > MAX_RANGE_MS)
      throw new CalendarReadLimitError(
        'Calendar views can cover at most one year.',
      );

    const [events, cancelledInstances] = await Promise.all([
      this.calendars.list(userId, from, to),
      this.calendars.listCancelledRecurringInstances(userId, from, to),
    ]);

    if (
      events.length >= MAX_EVENTS_PER_QUERY ||
      cancelledInstances.length >= MAX_EVENTS_PER_QUERY
    )
      throw new CalendarReadLimitError(
        'This calendar range contains too many records to expand safely.',
      );

    const series = events.filter(
      (event) =>
        event.recurringParentProviderEventId === null &&
        event.recurringParentEventId === null &&
        event.recurrence.length > 0,
    );

    const seriesById = new Map(series.map((item) => [item.id, item]));
    const seriesByKey = new Map(
      series.map((event) => [seriesKey(event), event] as const),
    );

    const exceptionsBySeries = new Map<string, CalendarEventForRead[]>();

    for (const exception of events) {
      const parentKey = exceptionParentKey(
        exception,
        exception.recurringParentEventId
          ? seriesById.get(exception.recurringParentEventId)
          : undefined,
      );

      if (!parentKey || !seriesByKey.has(parentKey)) continue;
      const grouped = exceptionsBySeries.get(parentKey) ?? [];
      grouped.push(exception);
      exceptionsBySeries.set(parentKey, grouped);
    }

    const cancelledBySeries = new Map<string, Set<string>>();

    for (const cancelled of cancelledInstances) {
      const identity =
        cancelled.originalStartAt?.toISOString() ??
        cancelled.originalStartDate?.toISOString().slice(0, 10);

      if (!identity) continue;
      const retainedParent = series.find(
        (parent) =>
          parent.providerBindingId === cancelled.bindingId &&
          parent.providerEventId === cancelled.recurringParentProviderEventId,
      );

      const key = retainedParent
        ? seriesKey(retainedParent)
        : googleSeriesKey(
            cancelled.bindingId,
            cancelled.recurringParentProviderEventId,
          );

      const grouped = cancelledBySeries.get(key) ?? new Set<string>();

      grouped.add(identity);
      cancelledBySeries.set(key, grouped);
    }

    const exceptionsByIdentity = new Map<
      string,
      Map<string, CalendarEventForRead>
    >();

    for (const [parentId, exceptions] of exceptionsBySeries) {
      const byIdentity = new Map<string, CalendarEventForRead>();

      for (const exception of exceptions) {
        const identity = exceptionIdentity(exception);
        if (identity) byIdentity.set(identity, exception);
      }

      exceptionsByIdentity.set(parentId, byIdentity);
    }

    const result: CalendarEventOccurrence[] = [];

    for (const event of events) {
      const parentKey = exceptionParentKey(
        event,
        event.recurringParentEventId
          ? seriesById.get(event.recurringParentEventId)
          : undefined,
      );

      if (parentKey) {
        if (!event.recurringParentEventId && !seriesByKey.has(parentKey))
          result.push(this.single(event));
        continue;
      }

      if (event.recurrence.length === 0) {
        result.push(this.single(event));
        continue;
      }

      const key = seriesKey(event);
      const occurrences = this.expandSeries(
        event,
        from,
        to,
        exceptionsByIdentity.get(key) ??
          new Map<string, CalendarEventForRead>(),
        cancelledBySeries.get(key) ?? new Set<string>(),
      );

      result.push(...occurrences);
      if (result.length > MAX_OCCURRENCES_PER_QUERY)
        throw new CalendarReadLimitError(
          'This calendar range produces too many events to display safely.',
        );
    }

    return result.sort((left, right) => sortStart(left) - sortStart(right));
  }

  private single(event: CalendarEvent): CalendarEventOccurrence {
    return {
      ...event,
      sourceEventId: event.id,
      seriesEventId: null,
      occurrenceKey: null,
      isOccurrence: false,
      instanceEventId: null,
    };
  }

  async resolveLocalOccurrenceForMutation(
    userId: string,
    seriesEventId: string,
    occurrenceKey: string,
    now = new Date(),
  ): Promise<CalendarEvent | null> {
    const series = await this.calendars.findById(userId, seriesEventId);
    const range = occurrenceRange(occurrenceKey);

    if (
      !series ||
      !['local', 'google'].includes(series.provider) ||
      series.recurringParentEventId !== null ||
      series.recurringParentProviderEventId !== null ||
      series.recurrence.length === 0 ||
      series.status === 'cancelled' ||
      !range ||
      Boolean(series.allDayStartDate) !==
        /^\d{4}-\d{2}-\d{2}$/.test(occurrenceKey)
    )
      return null;

    const occurrences = await this.list(userId, range.from, range.to);
    const occurrence = occurrences.find(
      (item) =>
        item.isOccurrence &&
        item.seriesEventId === series.id &&
        item.occurrenceKey === occurrenceKey,
    );

    if (!occurrence) return null;

    return this.calendars.materializeLocalOccurrence({
      userId,
      seriesEventId: series.id,
      occurrenceKey,
      expectedSeriesRevision: series.revision,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      allDayStartDate: occurrence.allDayStartDate,
      allDayEndDate: occurrence.allDayEndDate,
      now,
    });
  }

  private expandSeries(
    series: CalendarEvent,
    from: Date,
    to: Date,
    exceptions: Map<string, CalendarEventForRead>,
    cancelled: Set<string>,
  ): CalendarEventOccurrence[] {
    const allDay = series.allDayStartDate !== null;
    const start = allDay ? series.allDayStartDate : series.startAt;
    const end = allDay ? series.allDayEndDate : series.endAt;
    if (!start || !end)
      throw new Error(
        `Recurring calendar event ${series.id} has no valid date range.`,
      );
    const timezone = series.timezone ?? 'UTC';
    const dtstart = allDay ? new Date(start) : utcWallClock(start, timezone);
    const duration = allDay
      ? Math.ceil((end.getTime() - start.getTime()) / DAY_MS) * DAY_MS
      : end.getTime() - start.getTime();

    if (duration <= 0 || duration > MAX_RANGE_MS)
      throw new CalendarReadLimitError(
        `Recurring event ${series.id} has a duration outside the supported range.`,
      );

    const lowerBound = new Date(from.getTime() - duration);
    const upperBound = to;
    const after = allDay
      ? new Date(
          Date.UTC(
            lowerBound.getUTCFullYear(),
            lowerBound.getUTCMonth(),
            lowerBound.getUTCDate(),
          ),
        )
      : utcWallClock(lowerBound, timezone);

    const before = allDay
      ? new Date(
          Date.UTC(
            upperBound.getUTCFullYear(),
            upperBound.getUTCMonth(),
            upperBound.getUTCDate(),
          ),
        )
      : utcWallClock(upperBound, timezone);

    const { set, additionalInstants, excludedInstants, utcUntilRules } =
      recurrenceSet(series, dtstart);

    const dates = set.between(
      after,
      before,
      true,
      (_date, index) => index < MAX_OCCURRENCES_PER_SERIES + 1,
    );

    if (dates.length > MAX_OCCURRENCES_PER_SERIES)
      throw new CalendarReadLimitError(
        `Recurring event ${series.id} has too many occurrences in this range.`,
      );

    const instants = new Map<number, Date>();

    for (const candidate of dates) {
      const instant = allDay
        ? candidate
        : wallClockInstant(candidate, timezone);

      instants.set(instant.getTime(), instant);
    }

    const excludedWallTimes = new Set(
      set.exdates().map((date) => date.getTime()),
    );

    for (const { rule, until } of utcUntilRules) {
      if (until < lowerBound) continue;
      // One day beyond the local cutoff covers clock changes; the exact
      // UTC comparison below decides inclusion. Range/count limits still apply.
      const cutoffWall = utcWallClock(until, timezone);
      const ruleBefore = new Date(
        Math.min(before.getTime(), cutoffWall.getTime() + DAY_MS),
      );

      const candidates = rule.between(
        after,
        ruleBefore,
        true,
        (_date, index) => index < MAX_OCCURRENCES_PER_SERIES + 1,
      );

      if (candidates.length > MAX_OCCURRENCES_PER_SERIES)
        throw new CalendarReadLimitError(
          `Recurring event ${series.id} has too many occurrences in this range.`,
        );

      for (const candidate of candidates) {
        const instant = wallClockInstant(candidate, timezone);
        if (instant <= until && !excludedWallTimes.has(candidate.getTime()))
          instants.set(instant.getTime(), instant);
      }
    }

    for (const instant of additionalInstants) {
      if (instant >= lowerBound && instant <= upperBound)
        instants.set(instant.getTime(), instant);
    }

    if (instants.size > MAX_OCCURRENCES_PER_SERIES)
      throw new CalendarReadLimitError(
        `Recurring event ${series.id} has too many occurrences in this range.`,
      );
    const results: CalendarEventOccurrence[] = [];
    const handledExceptionIdentities = new Set<string>();

    for (const identityDate of instants.values()) {
      if (
        excludedInstants.has(identityDate.getTime()) ||
        excludedWallTimes.has(
          (allDay
            ? identityDate
            : utcWallClock(identityDate, timezone)
          ).getTime(),
        )
      )
        continue;
      const identity = occurrenceIdentity(series, identityDate);
      if (cancelled.has(identity)) continue;

      const startAt = allDay ? null : identityDate;
      const endAt = allDay ? null : new Date(identityDate.getTime() + duration);
      const allDayStartDate = allDay ? identityDate : null;
      const allDayEndDate = allDay
        ? new Date(identityDate.getTime() + duration)
        : null;

      const exception = exceptions.get(identity);

      if (exception) {
        handledExceptionIdentities.add(identity);
        if (exception.status === 'cancelled') continue;

        const isLocalException = exception.recurringParentEventId === series.id;
        const inheritsTime =
          isLocalException &&
          !exception.recurrenceOverrideFields.includes('time');

        const exceptionStart = inheritsTime
          ? (startAt ?? allDayStartDate)
          : (exception.startAt ?? exception.allDayStartDate);

        const exceptionEnd = inheritsTime
          ? (endAt ?? allDayEndDate)
          : (exception.endAt ?? exception.allDayEndDate);

        if (!exceptionStart || !exceptionEnd)
          throw new Error(
            `Recurring exception ${exception.id} has no valid date range.`,
          );

        if (exceptionStart < to && exceptionEnd > from) {
          results.push(
            asOccurrence(
              exception,
              series,
              identity,
              inheritsTime ? startAt : exception.startAt,
              inheritsTime ? endAt : exception.endAt,
              inheritsTime ? allDayStartDate : exception.allDayStartDate,
              inheritsTime ? allDayEndDate : exception.allDayEndDate,
              exception.providerEventId,
            ),
          );
        }

        continue;
      }

      if (
        (startAt ?? allDayStartDate)! < to &&
        (endAt ?? allDayEndDate)! > from
      ) {
        results.push(
          asOccurrence(
            series,
            series,
            identity,
            startAt,
            endAt,
            allDayStartDate,
            allDayEndDate,
            null,
          ),
        );
      }
    }

    for (const [projectedIdentity, exception] of exceptions) {
      const identity = exceptionIdentity(exception) ?? projectedIdentity;
      if (handledExceptionIdentities.has(identity)) continue;
      if (exception.status === 'cancelled') continue;
      const exceptionStart = exception.startAt ?? exception.allDayStartDate;
      const exceptionEnd = exception.endAt ?? exception.allDayEndDate;
      if (!exceptionStart || !exceptionEnd)
        throw new Error(
          `Recurring exception ${exception.id} has no valid date range.`,
        );

      if (exceptionStart < to && exceptionEnd > from) {
        results.push(
          asOccurrence(
            exception,
            series,
            identity,
            exception.startAt,
            exception.endAt,
            exception.allDayStartDate,
            exception.allDayEndDate,
            exception.providerEventId,
          ),
        );
      }
    }

    return results;
  }
}
