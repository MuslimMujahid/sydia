import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
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
import { todayQueryKeys } from "../today/today.queries";
import { conversationQueryKeys } from "../conversations/conversations.queries";

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

function cacheReminder(queryClient: QueryClient, reminder: Reminder) {
  queryClient.setQueryData(reminderQueryKeys.detail(reminder.id), reminder);
}

export function useCreateReminder() {
  return useMutation({
    mutationFn: createReminder,
    meta: {
      invalidateQueries: [
        reminderQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateReminder,
    onSuccess: (reminder) => cacheReminder(queryClient, reminder),
    meta: {
      invalidateQueries: [
        reminderQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReminder,
    onError: (error) => {
      console.warn("Reminder deletion failed", { name: error.name });
    },
    onSuccess: (_, reminderId) => {
      queryClient.removeQueries({
        queryKey: reminderQueryKeys.detail(reminderId),
      });
    },
    meta: {
      invalidateQueries: [
        reminderQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useSnoozeReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: snoozeReminder,
    onSuccess: (reminder) => cacheReminder(queryClient, reminder),
    meta: {
      invalidateQueries: [
        reminderQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useRescheduleReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reminderId,
      scheduledAt,
    }: {
      reminderId: string;
      scheduledAt: string;
    }) =>
      updateReminder({
        reminderId,
        values: { scheduledAt },
      }),
    onSuccess: (reminder) => cacheReminder(queryClient, reminder),
    meta: {
      invalidateQueries: [
        reminderQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useAcknowledgeReminder() {
  return useMutation({
    mutationFn: acknowledgeReminder,
    meta: {
      invalidateQueries: [
        reminderQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}
