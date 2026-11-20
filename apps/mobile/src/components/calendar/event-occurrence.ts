import type {
  CalendarEvent,
  CalendarRange,
} from "@/lib/services/api/calendar/calendar.api";

/**
 * Recurring events reach the client as projected occurrences whose id is
 * `occurrence:<seriesId>:<encoded occurrence key>` (see the backend's
 * calendar-read service). Those ids cannot be fetched directly; they are
 * found again by reading the events around the occurrence key.
 */
export type OccurrenceId = { seriesEventId: string; occurrenceKey: string };

const PREFIX = "occurrence:";
const DAY_MS = 86_400_000;

export function isOccurrenceId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export function parseOccurrenceId(id: string): OccurrenceId | null {
  if (!isOccurrenceId(id)) return null;
  const rest = id.slice(PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator <= 0) return null;

  try {
    const occurrenceKey = decodeURIComponent(rest.slice(separator + 1));

    return occurrenceKey
      ? { seriesEventId: rest.slice(0, separator), occurrenceKey }
      : null;
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

/**
 * A read range around an occurrence key. A moved occurrence keeps its
 * original key, so the window reaches a few days to either side.
 */
export function occurrenceLookupRange(
  occurrenceKey: string
): CalendarRange | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(occurrenceKey);
  const start = new Date(
    dateOnly ? `${occurrenceKey}T00:00:00.000Z` : occurrenceKey
  );
  if (!Number.isFinite(start.getTime())) return null;
  const day = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );

  return {
    from: new Date(day - 3 * DAY_MS).toISOString(),
    to: new Date(day + 4 * DAY_MS).toISOString(),
  };
}

/** The occurrence among events read for its lookup range. */
export function findOccurrence(
  events: CalendarEvent[],
  id: string,
  occurrence: OccurrenceId
): CalendarEvent | undefined {
  return (
    events.find((event) => event.id === id) ??
    events.find(
      (event) =>
        event.isOccurrence === true &&
        event.seriesEventId === occurrence.seriesEventId &&
        event.occurrenceKey === occurrence.occurrenceKey
    )
  );
}

/** Whether an event is one projected occurrence of a recurring series. */
export function isRecurringOccurrence(event: CalendarEvent): boolean {
  return event.isOccurrence === true;
}
