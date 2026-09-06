import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type ReminderStatus = "scheduled" | "completed" | "cancelled";
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

export type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  status: ReminderStatus;
  scheduledAt: string;
  recurrence: ReminderRecurrence | null;
  source: ReminderSource | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderFilters = {
  status?: ReminderStatus | "all";
  schedule?: ReminderScheduleFilter | "all";
  search?: string;
};

export type CreateReminderInput = {
  title: string;
  notes?: string | null;
  scheduledAt: string;
  recurrence?: ReminderRecurrence | null;
};

export type UpdateReminderInput = Partial<CreateReminderInput> & {
  status?: ReminderStatus;
  snoozeUntil?: string;
};

const reminderFiltersSchema = z.object({
  status: z.enum(["scheduled", "completed", "cancelled", "all"]).optional(),
  schedule: z.enum(["today", "upcoming", "past", "all"]).optional(),
  search: z.string().optional(),
});

function reminderParams(filters: ReminderFilters) {
  return {
    status: filters.status === "all" ? undefined : filters.status,
    schedule: filters.schedule === "all" ? undefined : filters.schedule,
    search: filters.search?.trim() || undefined,
  };
}

const getRemindersServer = createServerFn({ method: "GET" })
  .validator(reminderFiltersSchema)
  .handler(async ({ data }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Reminder[]>>("/reminders", {
        params: reminderParams(data),
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar pengingat tidak dapat dimuat.");
    }
  });

const getReminderServer = createServerFn({ method: "GET" })
  .validator(z.string().min(1))
  .handler(async ({ data: reminderId }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Reminder>>(
        `/reminders/${encodeURIComponent(reminderId)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Pengingat ini tidak dapat dimuat.");
    }
  });

export async function getReminders(
  filters: ReminderFilters = {}
): Promise<Reminder[]> {
  if (typeof window === "undefined")
    return getRemindersServer({ data: filters });

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
  if (typeof window === "undefined") {
    return getReminderServer({ data: reminderId });
  }

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
