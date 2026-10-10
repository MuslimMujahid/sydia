import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type CalendarStatus = {
  connected: boolean;
  connectionStatus:
    "connected" | "reconnect_required" | "disconnecting" | "disconnected";
  cleanupPending?: boolean;
  provider: "google";
  calendarId?: string | null;
  calendarName?: string | null;
  googleEmail?: string | null;
  bindingState?: string | null;
  lastSyncedAt?: string | null;
  lastErrorCode?: string | null;
  pendingOperationCount: number;
  openConflictCount: number;
  watchExpiresAt?: string | null;
  updatedAt?: string | null;
  available?: boolean;
};

export type CalendarDisconnectResult = {
  connected: false;
  connectionStatus: "disconnecting" | "disconnected";
  cleanupPending: boolean;
};

export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export type CalendarEvent = {
  id: string;
  provider: string;
  providerEventId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  recurrence: string[];
  recurrenceOverrideFields?: string[];
  recurringParentProviderEventId: string | null;
  recurringParentEventId: string | null;
  recurrenceExceptionKey: string | null;
  originalStartAt: string | null;
  originalStartDate: string | null;
  attendees: string[];
  status: CalendarEventStatus;
  syncState:
    | "local"
    | "pending"
    | "synced"
    | "conflict"
    | "error"
    | "reconnect_required";
  sourceEventId?: string;
  seriesEventId?: string | null;
  occurrenceKey?: string | null;
  isOccurrence?: boolean;
  instanceEventId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarConflictSnapshot = {
  title: string | null;
  description: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  recurrence: string[];
  attendees: string[];
  status: CalendarEventStatus;
};

export type CalendarSyncConflict = {
  id: string;
  eventId: string;
  title: string;
  localRevision: number;
  remoteEtag: string | null;
  fields: string[];
  local: CalendarConflictSnapshot;
  remote: CalendarConflictSnapshot | null;
  remoteDeleted: boolean;
  createdAt: string;
};

export type GoogleCalendarOption = {
  id: string;
  name: string;
  timezone: string;
  primary: boolean;
  writable: boolean;
};

type CalendarEventCommonWriteInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  attendees?: string[];
  recurrence?: string[];
};

export type CalendarEventWriteInput =
  | (CalendarEventCommonWriteInput & {
      startAt: string;
      endAt: string;
      timezone: string;
      allDayStartDate?: never;
      allDayEndDate?: never;
    })
  | (CalendarEventCommonWriteInput & {
      allDayStartDate: string;
      allDayEndDate: string;
      timezone?: string | null;
      startAt?: never;
      endAt?: never;
    });

export type UpdateCalendarEventInput = {
  eventId: string;
  values: Partial<CalendarEventWriteInput>;
  idempotencyKey: string;
};

export type CreateCalendarEventInput = {
  values: CalendarEventWriteInput;
  idempotencyKey: string;
  destination?: "auto" | "local" | "google";
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

const getCalendarConflictsServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<CalendarSyncConflict[]>>(
        "/calendar/conflicts",
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Konflik kalender tidak dapat dimuat.");
    }
  }
);

const getGoogleCalendarsServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<GoogleCalendarOption[]>>(
        "/calendar/google/calendars",
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Pilihan kalender Google tidak dapat dimuat.");
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
    const response =
      await api.get<ApiResponse<CalendarStatus>>("/calendar/status");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Status kalender tidak dapat dimuat.");
  }
}

export async function getCalendarConflicts(): Promise<CalendarSyncConflict[]> {
  if (typeof window === "undefined") return getCalendarConflictsServer();

  try {
    const response = await api.get<ApiResponse<CalendarSyncConflict[]>>(
      "/calendar/conflicts"
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Konflik kalender tidak dapat dimuat.");
  }
}

export async function getGoogleCalendars(): Promise<GoogleCalendarOption[]> {
  if (typeof window === "undefined") return getGoogleCalendarsServer();

  try {
    const response = await api.get<ApiResponse<GoogleCalendarOption[]>>(
      "/calendar/google/calendars"
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pilihan kalender Google tidak dapat dimuat.");
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

export async function getCalendarEvent(
  eventId: string
): Promise<CalendarEvent> {
  try {
    const response = await api.get<ApiResponse<CalendarEvent>>(
      `/calendar/events/${encodeURIComponent(eventId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Acara kalender tidak dapat dimuat.");
  }
}

export async function resolveCalendarOccurrence(input: {
  seriesEventId: string;
  occurrenceKey: string;
  instanceEventId?: string | null;
}): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      "/calendar/events/occurrences/resolve",
      input
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kejadian berulang tidak dapat dimuat.");
  }
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput
): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      "/calendar/events",
      { ...input.values, destination: input.destination ?? "auto" },
      { headers: { "Idempotency-Key": input.idempotencyKey } }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Acara tidak dapat dibuat.");
  }
}

export async function copyCalendarEvent(input: {
  eventId: string;
  idempotencyKey: string;
}): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      `/calendar/events/${encodeURIComponent(input.eventId)}/copy`,
      undefined,
      { headers: { "Idempotency-Key": input.idempotencyKey } }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Acara tidak dapat disalin ke Sydia.");
  }
}

export async function exportCalendarEvent(input: {
  eventId: string;
  idempotencyKey: string;
}): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      `/calendar/events/${encodeURIComponent(input.eventId)}/export`,
      undefined,
      { headers: { "Idempotency-Key": input.idempotencyKey } }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Acara tidak dapat diekspor ke Google Calendar.");
  }
}

export async function resolveCalendarConflict(input: {
  conflictId: string;
  resolution: "keep_sydia" | "use_google";
  expectedLocalRevision: number;
  expectedRemoteEtag: string | null;
  idempotencyKey: string;
}): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      `/calendar/conflicts/${encodeURIComponent(input.conflictId)}/resolve`,
      {
        resolution: input.resolution,
        expectedLocalRevision: input.expectedLocalRevision,
        expectedRemoteEtag: input.expectedRemoteEtag,
      },
      { headers: { "Idempotency-Key": input.idempotencyKey } }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Konflik kalender tidak dapat diselesaikan.");
  }
}

export async function selectGoogleCalendar(input: {
  calendarId: string;
}): Promise<{ calendarId: string; calendarName: string; changed: boolean }> {
  try {
    const response = await api.post<
      ApiResponse<{
        calendarId: string;
        calendarName: string;
        changed: boolean;
      }>
    >("/calendar/google/calendar", input);

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kalender Google tidak dapat dipilih.");
  }
}

export async function updateCalendarEvent({
  eventId,
  values,
  idempotencyKey,
}: UpdateCalendarEventInput): Promise<CalendarEvent> {
  try {
    const response = await api.patch<ApiResponse<CalendarEvent>>(
      `/calendar/events/${encodeURIComponent(eventId)}`,
      values,
      { headers: { "Idempotency-Key": idempotencyKey } }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan acara tidak dapat disimpan.");
  }
}

export async function retryCalendarEventSync(
  eventId: string
): Promise<CalendarEvent> {
  try {
    const response = await api.post<ApiResponse<CalendarEvent>>(
      `/calendar/events/${encodeURIComponent(eventId)}/retry-sync`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(
      error,
      "Sinkronisasi ulang acara tidak dapat dijadwalkan."
    );
  }
}

export async function deleteCalendarEvent(input: {
  eventId: string;
  idempotencyKey: string;
}): Promise<void> {
  try {
    await api.delete(`/calendar/events/${encodeURIComponent(input.eventId)}`, {
      headers: { "Idempotency-Key": input.idempotencyKey },
    });
  } catch (error) {
    throw toApiError(error, "Acara tidak dapat dibatalkan.");
  }
}

export async function disconnectCalendar(): Promise<CalendarDisconnectResult> {
  try {
    const response = await api.post<ApiResponse<CalendarDisconnectResult>>(
      "/calendar/disconnect"
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kalender Google tidak dapat diputuskan.");
  }
}

export async function getGoogleCalendarAuthorizationUrl(): Promise<string> {
  try {
    const response = await api.post<ApiResponse<{ url: string }>>(
      "/calendar/google/connect"
    );

    return response.data.data.url;
  } catch (error) {
    throw toApiError(error, "Koneksi Google Calendar tidak dapat dimulai.");
  }
}
