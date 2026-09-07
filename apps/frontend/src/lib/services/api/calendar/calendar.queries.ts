import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { conversationQueryKeys } from "../conversations/conversations.queries";
import { todayQueryKeys } from "../today/today.queries";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
  getCalendarEvents,
  getCalendarStatus,
  updateCalendarEvent,
  type CalendarEvent,
  type CalendarRange,
} from "./calendar.api";

export const calendarQueryKeys = {
  all: ["calendar"] as const,
  status: () => ["calendar", "status"] as const,
  events: () => ["calendar", "events"] as const,
  eventList: (range: CalendarRange) => ["calendar", "events", range] as const,
};

export const calendarStatusQueryOptions = () =>
  queryOptions({
    queryKey: calendarQueryKeys.status(),
    queryFn: getCalendarStatus,
    staleTime: 30_000,
  });

export const calendarEventsQueryOptions = (range: CalendarRange) =>
  queryOptions({
    queryKey: calendarQueryKeys.eventList(range),
    queryFn: () => getCalendarEvents(range),
    staleTime: 15_000,
  });

function cacheCalendarEvent(queryClient: QueryClient, event: CalendarEvent) {
  queryClient.setQueriesData<CalendarEvent[]>(
    { queryKey: calendarQueryKeys.events() },
    (current) => {
      if (!current) return current;
      const withoutEvent = current.filter((item) => item.id !== event.id);

      return [...withoutEvent, event].sort((left, right) =>
        left.startAt.localeCompare(right.startAt)
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

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCalendarEvent,
    onSuccess: (event) => cacheCalendarEvent(queryClient, event),
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
