import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type CalendarStatus = {
  connected: boolean;
  provider: "google";
  calendarId?: string | null;
  updatedAt?: string | null;
  available?: boolean;
};

export type CalendarEventStatus = "confirmed" | "cancelled";

export type CalendarEvent = {
  id: string;
  provider: string;
  providerEventId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  attendees: string[];
  status: CalendarEventStatus;
  createdAt: string;
  updatedAt: string;
};

export type CalendarEventWriteInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  attendees?: string[];
};

export type UpdateCalendarEventInput = {
  eventId: string;
  values: Partial<CalendarEventWriteInput>;
};

export type CalendarRange = { from: string; to: string };

const calendarRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const getCalendarStatusServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<CalendarStatus>>(
        "/calendar/status",
        { headers: cookie ? { cookie } : undefined }
      );
      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Status kalender tidak dapat dimuat.");
    }
  }
);

const getCalendarEventsServer = createServerFn({ method: "GET" })
  .validator(calendarRangeSchema)
  .handler(async ({ data }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<CalendarEvent[]>>(
        "/calendar/events",
        {
          params: data,
          headers: cookie ? { cookie } : undefined,
        }
      );
      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Agenda tidak dapat dimuat.");
    }
  });

export async function getCalendarStatus(): Promise<CalendarStatus> {
  if (typeof window === "undefined") return getCalendarStatusServer();

  try {
    const response = await api.get<ApiResponse<CalendarStatus>>(
      "/calendar/status"
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Status kalender tidak dapat dimuat.");
  }
}

export async function getCalendarEvents(
  range: CalendarRange
): Promise<CalendarEvent[]> {
  if (typeof window === "undefined")
    return getCalendarEventsServer({ data: range });

  try {
    const response = await api.get<ApiResponse<CalendarEvent[]>>(
      "/calendar/events",
      { params: range }
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Agenda tidak dapat dimuat.");
  }
}

export async function createCalendarEvent(
  values: CalendarEventWriteInput
): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      "/calendar/events",
      values
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Acara tidak dapat dibuat.");
  }
}

export async function updateCalendarEvent({
  eventId,
  values,
}: UpdateCalendarEventInput): Promise<CalendarEvent> {
  try {
    const response = await api.patch<ApiResponse<CalendarEvent>>(
      `/calendar/events/${encodeURIComponent(eventId)}`,
      values
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan acara tidak dapat disimpan.");
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  try {
    await api.delete(`/calendar/events/${encodeURIComponent(eventId)}`);
  } catch (error) {
    throw toApiError(error, "Acara tidak dapat dibatalkan.");
  }
}

export async function disconnectCalendar(): Promise<void> {
  try {
    await api.post("/calendar/disconnect");
  } catch (error) {
    throw toApiError(error, "Kalender Google tidak dapat diputuskan.");
  }
}

export async function getGoogleCalendarAuthorizationUrl(): Promise<string> {
  try {
    const response = await api.get<ApiResponse<{ url: string }>>(
      "/calendar/google/connect"
    );
    return response.data.data.url;
  } catch (error) {
    throw toApiError(error, "Koneksi Google Calendar tidak dapat dimulai.");
  }
}

