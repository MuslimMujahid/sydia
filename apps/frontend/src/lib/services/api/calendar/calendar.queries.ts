import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  refreshCalendarOnMount,
  waitForCalendarStatus,
} from "./calendar-refresh";
import { conversationQueryKeys } from "../conversations/conversations.queries";
import { todayQueryKeys } from "../today/today.queries";
import {
  createCalendarEvent,
  copyCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
  exportCalendarEvent,
  getCalendarEvents,
  resolveCalendarOccurrence,
  retryCalendarEventSync,
  getCalendarConflicts,
  getCalendarStatus,
  requestCalendarPoll,
  getGoogleCalendars,
  resolveCalendarConflict,
  selectGoogleCalendar,
  updateCalendarEvent,
  type CalendarEvent,
  type CalendarRange,
} from "./calendar.api";

export const calendarQueryKeys = {
  all: ["calendar"] as const,
  status: () => ["calendar", "status"] as const,
  conflicts: () => ["calendar", "conflicts"] as const,
  googleCalendars: () => ["calendar", "google-calendars"] as const,
  events: () => ["calendar", "events"] as const,
  eventList: (range: CalendarRange) => ["calendar", "events", range] as const,
};

export const calendarStatusQueryOptions = () =>
  queryOptions({
    queryKey: calendarQueryKeys.status(),
    queryFn: ({ signal }) => getCalendarStatus(signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

export const calendarEventsQueryOptions = (range: CalendarRange) =>
  queryOptions({
    queryKey: calendarQueryKeys.eventList(range),
    queryFn: () => getCalendarEvents(range),
    staleTime: 15_000,
  });

export const calendarConflictsQueryOptions = () =>
  queryOptions({
    queryKey: calendarQueryKeys.conflicts(),
    queryFn: getCalendarConflicts,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const googleCalendarsQueryOptions = (enabled = true) =>
  queryOptions({
    queryKey: calendarQueryKeys.googleCalendars(),
    queryFn: getGoogleCalendars,
    staleTime: 5 * 60_000,
    enabled,
  });

function cacheCalendarEvent(queryClient: QueryClient, event: CalendarEvent) {
  queryClient.setQueriesData<CalendarEvent[]>(
    { queryKey: calendarQueryKeys.events() },
    (current) => {
      if (!current) return current;
      const withoutEvent = current.filter((item) => item.id !== event.id);

      return [...withoutEvent, event].sort((left, right) =>
        (left.startAt ?? left.allDayStartDate ?? "").localeCompare(
          right.startAt ?? right.allDayStartDate ?? ""
        )
      );
    }
  );
}

const invalidatedKeys = [
  calendarQueryKeys.all,
  todayQueryKeys.all,
  conversationQueryKeys.all,
];

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCalendarEvent,
    onSuccess: (event) => cacheCalendarEvent(queryClient, event),
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useCopyCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: copyCalendarEvent,
    onSuccess: (event) => cacheCalendarEvent(queryClient, event),
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useExportCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: exportCalendarEvent,
    onSuccess: (event) => cacheCalendarEvent(queryClient, event),
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCalendarEvent,
    onSuccess: (event) => cacheCalendarEvent(queryClient, event),
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useRetryCalendarEventSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryCalendarEventSync,
    onSuccess: (event) => cacheCalendarEvent(queryClient, event),
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useResolveCalendarOccurrence() {
  return useMutation({
    mutationFn: resolveCalendarOccurrence,
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useDeleteCalendarEvent() {
  return useMutation({
    mutationFn: deleteCalendarEvent,
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useDisconnectCalendar() {
  return useMutation({
    mutationFn: disconnectCalendar,
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useResolveCalendarConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resolveCalendarConflict,
    onSuccess: (event: CalendarEvent) => cacheCalendarEvent(queryClient, event),
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useSelectGoogleCalendar() {
  return useMutation({
    mutationFn: selectGoogleCalendar,
    meta: { invalidateQueries: invalidatedKeys },
  });
}

export function useRefreshCalendarOnMount(connected: boolean) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (signal: AbortSignal) =>
      refreshCalendarOnMount(
        {
          requestPoll: requestCalendarPoll,
          readStatus: getCalendarStatus,
          wait: waitForCalendarStatus,
        },
        signal
      ),
    onSuccess: async (result) => {
      if (result.status === "cancelled") return;
      queryClient.setQueryData(
        calendarQueryKeys.status(),
        result.calendarStatus
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarQueryKeys.events() }),
        queryClient.invalidateQueries({
          queryKey: calendarQueryKeys.conflicts(),
        }),
        queryClient.invalidateQueries({ queryKey: todayQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      console.error("Google Calendar page refresh failed", error),
  });

  const { mutate } = mutation;

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    mutate(controller.signal);

    return () => controller.abort();
  }, [connected, mutate]);

  return mutation;
}
