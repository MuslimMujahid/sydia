import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type ReminderScheduleFilter = "today" | "upcoming" | "past";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type ReminderRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  endsAt?: string | null;
};

export type ReminderSource = {
  type: "dashboard" | "chat" | "whatsapp";
  label?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

export type ReminderOccurrenceStatus =
  | "pending"
  | "delivered"
  | "awaiting_ack"
  | "acknowledged"
  | "snoozed"
  | "superseded"
  | "expired"
  | "cancelled"
  | "obsolete";

export type ReminderOccurrence = {
  id: string;
  occurrenceAt: string;
  status: ReminderOccurrenceStatus;
  messagesSent: number;
  lastSentAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
};

export type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  scheduledAt: string;
  recurrence: ReminderRecurrence | null;
  source: ReminderSource | null;
  /** Repeats until acknowledged, every `repeatIntervalMinutes`. */
  important: boolean;
  repeatIntervalMinutes: number;
  /** Set on a snooze copy: the fired occurrence it postponed. */
  snoozedFrom: { occurrenceId: string; occurrenceAt: string } | null;
  /** The newest occurrence already sent; null until the reminder first fires. */
  latestOccurrence: ReminderOccurrence | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderFilters = {
  schedule?: ReminderScheduleFilter | "all";
  search?: string;
};

export type CreateReminderInput = {
  title: string;
  notes?: string | null;
  scheduledAt: string;
  recurrence?: ReminderRecurrence | null;
  important?: boolean;
  repeatIntervalMinutes?: number;
};

export type UpdateReminderInput = Partial<CreateReminderInput>;

export type SnoozeReminderInput = {
  reminderId: string;
  until: string;
  occurrenceId?: string;
  confirmPastNextOccurrence?: boolean;
};

/** Whether reminders can currently reach the owner through Telegram or WhatsApp. */
export type ReminderDelivery =
  | { status: "reachable"; channels: ("telegram" | "whatsapp")[] }
  | { status: "no_channel" }
  | { status: "notifications_off" };

function reminderParams(filters: ReminderFilters) {
  return {
    schedule: filters.schedule === "all" ? undefined : filters.schedule,
    search: filters.search?.trim() || undefined,
  };
}

export async function getReminders(
  filters: ReminderFilters = {}
): Promise<Reminder[]> {
  try {
    const response = await api.get<ApiResponse<Reminder[]>>("/reminders", {
      params: reminderParams(filters),
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar pengingat tidak dapat dimuat.");
  }
}

export async function getReminder(reminderId: string): Promise<Reminder> {
  try {
    const response = await api.get<ApiResponse<Reminder>>(
      `/reminders/${encodeURIComponent(reminderId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pengingat ini tidak dapat dimuat.");
  }
}

export async function createReminder(
  values: CreateReminderInput
): Promise<Reminder> {
  try {
    const response = await api.post<ApiResponse<Reminder>>(
      "/reminders",
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pengingat tidak dapat dibuat.");
  }
}

export async function updateReminder({
  reminderId,
  values,
}: {
  reminderId: string;
  values: UpdateReminderInput;
}): Promise<Reminder> {
  try {
    const response = await api.patch<ApiResponse<Reminder>>(
      `/reminders/${encodeURIComponent(reminderId)}`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan pengingat tidak dapat disimpan.");
  }
}

export async function deleteReminder(reminderId: string): Promise<void> {
  try {
    await api.delete(`/reminders/${encodeURIComponent(reminderId)}`);
  } catch (error) {
    throw toApiError(error, "Pengingat tidak dapat dihapus.");
  }
}

/** Creates a one-time copy at `until`; the original schedule never moves. */
export async function snoozeReminder({
  reminderId,
  ...values
}: SnoozeReminderInput): Promise<Reminder> {
  try {
    const response = await api.post<ApiResponse<Reminder>>(
      `/reminders/${encodeURIComponent(reminderId)}/snooze`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pengingat tidak dapat ditunda.");
  }
}

/** Stops the repeats of an important reminder that awaits confirmation. */
export async function acknowledgeReminder({
  reminderId,
  occurrenceId,
}: {
  reminderId: string;
  occurrenceId?: string;
}): Promise<{ acknowledged: { id: string }[] }> {
  try {
    const response = await api.post<
      ApiResponse<{ acknowledged: { id: string }[] }>
    >(`/reminders/${encodeURIComponent(reminderId)}/acknowledge`, {
      ...(occurrenceId ? { occurrenceId } : {}),
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pengingat tidak dapat dikonfirmasi.");
  }
}

export async function getReminderDelivery(): Promise<ReminderDelivery> {
  try {
    const response = await api.get<ApiResponse<ReminderDelivery>>(
      "/reminders/delivery"
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Status pengiriman pengingat tidak dapat dimuat.");
  }
}
