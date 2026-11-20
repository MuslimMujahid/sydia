import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { conversationQueryKeys } from "../conversations/conversations.queries";
import { todayQueryKeys } from "../today/today.api";
import {
  acknowledgeReminder,
  createReminder,
  deleteReminder,
  getReminder,
  getReminderDelivery,
  getReminders,
  snoozeReminder,
  updateReminder,
  type Reminder,
  type ReminderFilters,
} from "./reminders.api";

export const reminderQueryKeys = {
  all: ["reminders"] as const,
  lists: () => ["reminders", "list"] as const,
  list: (filters: ReminderFilters) => ["reminders", "list", filters] as const,
  details: () => ["reminders", "detail"] as const,
  detail: (reminderId: string) => ["reminders", "detail", reminderId] as const,
  delivery: () => ["reminders", "delivery"] as const,
};

export const reminderDeliveryQueryOptions = () =>
  queryOptions({
    queryKey: reminderQueryKeys.delivery(),
    queryFn: getReminderDelivery,
    // Refetch on every visit so the notice clears right after a user returns
    // from connecting Telegram or turning notifications back on.
    staleTime: 0,
  });

export const remindersQueryOptions = (filters: ReminderFilters = {}) =>
  queryOptions({
    queryKey: reminderQueryKeys.list(filters),
    queryFn: () => getReminders(filters),
    staleTime: 15_000,
  });

export const reminderQueryOptions = (reminderId: string) =>
  queryOptions({
    queryKey: reminderQueryKeys.detail(reminderId),
    queryFn: () => getReminder(reminderId),
    enabled: Boolean(reminderId),
  });

const invalidated = [
  reminderQueryKeys.all,
  todayQueryKeys.all,
  conversationQueryKeys.all,
];

function cacheReminder(queryClient: QueryClient, reminder: Reminder) {
  queryClient.setQueryData(reminderQueryKeys.detail(reminder.id), reminder);
}

export function useCreateReminder() {
  return useMutation({
    mutationFn: createReminder,
    meta: { invalidateQueries: invalidated },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateReminder,
    onSuccess: (reminder) => cacheReminder(queryClient, reminder),
    meta: { invalidateQueries: invalidated },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReminder,
    onSuccess: (_, reminderId) => {
      queryClient.setQueriesData<Reminder[]>(
        { queryKey: reminderQueryKeys.lists() },
        (reminders) => reminders?.filter((item) => item.id !== reminderId)
      );
      queryClient.removeQueries({
        queryKey: reminderQueryKeys.detail(reminderId),
      });
    },
    meta: { invalidateQueries: invalidated },
  });
}

export function useSnoozeReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: snoozeReminder,
    onSuccess: (reminder) => cacheReminder(queryClient, reminder),
    meta: { invalidateQueries: invalidated },
  });
}

export function useAcknowledgeReminder() {
  return useMutation({
    mutationFn: acknowledgeReminder,
    meta: { invalidateQueries: invalidated },
  });
}
