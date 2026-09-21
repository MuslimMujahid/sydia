import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    );
  });

const dailyNoteRangeSchema = z.object({
  from: dayKeySchema,
  to: dayKeySchema,
});

export type TiptapJsonValue =
  | string
  | number
  | boolean
  | null
  | TiptapJsonValue[]
  | { [key: string]: TiptapJsonValue };

export type TiptapNode = { [key: string]: TiptapJsonValue };

export type TiptapDoc = {
  type: "doc";
  content?: TiptapNode[];
};

export type DailyNoteSummary = {
  date: string;
  excerpt: string;
  updatedAt: string;
};

export type DailyNote = {
  id: string;
  date: string;
  content: TiptapDoc;
  text: string;
  createdAt: string;
  updatedAt: string;
  source: {
    type: "dashboard" | "chat" | "whatsapp" | "telegram";
    label: string | null;
  };
};

export type DailyNoteRange = {
  from: string;
  to: string;
};

export type UpsertDailyNoteVariables = {
  date: string;
  content: TiptapDoc;
};

const getDailyNotesServer = createServerFn({ method: "GET" })
  .validator(dailyNoteRangeSchema)
  .handler(async ({ data }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<DailyNoteSummary[]>>(
        "/daily-notes",
        {
          params: data,
          headers: cookie ? { cookie } : undefined,
        }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar catatan harian tidak dapat dimuat.");
    }
  });

const getDailyNoteServer = createServerFn({ method: "GET" })
  .validator(dayKeySchema)
  .handler(async ({ data: date }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<{ note: DailyNote | null }>>(
        `/daily-notes/${encodeURIComponent(date)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data.note;
    } catch (error) {
      throw toApiError(error, "Catatan harian ini tidak dapat dimuat.");
    }
  });

export async function getDailyNotes(
  range: DailyNoteRange
): Promise<DailyNoteSummary[]> {
  if (typeof window === "undefined")
    return getDailyNotesServer({ data: range });

  try {
    const response = await api.get<ApiResponse<DailyNoteSummary[]>>(
      "/daily-notes",
      { params: range }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar catatan harian tidak dapat dimuat.");
  }
}

export async function getDailyNote(date: string): Promise<DailyNote | null> {
  if (typeof window === "undefined") return getDailyNoteServer({ data: date });

  try {
    const response = await api.get<ApiResponse<{ note: DailyNote | null }>>(
      `/daily-notes/${encodeURIComponent(date)}`
    );

    return response.data.data.note;
  } catch (error) {
    throw toApiError(error, "Catatan harian ini tidak dapat dimuat.");
  }
}

/**
 * Writes one day's note. An empty document clears the day, so the response
 * reports `note: null` and the caller treats the day as having no note.
 */
export async function upsertDailyNote({
  date,
  content,
}: UpsertDailyNoteVariables): Promise<DailyNote | null> {
  try {
    const response = await api.put<
      ApiResponse<{ note: DailyNote | null; cleared: boolean }>
    >(`/daily-notes/${encodeURIComponent(date)}`, { content });

    return response.data.data.note;
  } catch (error) {
    throw toApiError(error, "Catatan harian tidak dapat disimpan.");
  }
}

export async function deleteDailyNote(date: string): Promise<void> {
  try {
    await api.delete(`/daily-notes/${encodeURIComponent(date)}`);
  } catch (error) {
    throw toApiError(error, "Catatan harian tidak dapat dihapus.");
  }
}
