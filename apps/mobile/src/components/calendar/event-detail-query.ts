import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@/lib/services/api/api";
import {
  getCalendarEvent,
  getCalendarEvents,
  type CalendarEvent,
} from "@/lib/services/api/calendar/calendar.api";
import { calendarQueryKeys } from "@/lib/services/api/calendar/calendar.queries";
import {
  findOccurrence,
  occurrenceLookupRange,
  parseOccurrenceId,
} from "./event-occurrence";

/**
 * Reads any event id the app may hold: a stored event, or a projected
 * occurrence of a recurring series (found again around its occurrence key).
 */
export async function getEventOrOccurrence(
  eventId: string
): Promise<CalendarEvent> {
  const occurrence = parseOccurrenceId(eventId);
  if (!occurrence) return getCalendarEvent(eventId);

  const range = occurrenceLookupRange(occurrence.occurrenceKey);
  const found = range
    ? findOccurrence(await getCalendarEvents(range), eventId, occurrence)
    : undefined;

  if (!found)
    throw new ApiClientError(
      "Kejadian acara ini tidak ditemukan. Mungkin sudah diubah atau dibatalkan.",
      { status: 404, code: "NOT_FOUND" }
    );

  return found;
}

export const calendarEventDetailQueryOptions = (eventId: string) =>
  queryOptions({
    queryKey: calendarQueryKeys.eventDetail(eventId),
    queryFn: () => getEventOrOccurrence(eventId),
    enabled: Boolean(eventId),
    staleTime: 15_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiClientError && error.status === 404) &&
      failureCount < 2,
  });

/** Lets the detail screen open instantly with the row the user tapped. */
export function seedEventDetail(
  queryClient: QueryClient,
  event: CalendarEvent
) {
  queryClient.setQueryData(calendarQueryKeys.eventDetail(event.id), event);
}
