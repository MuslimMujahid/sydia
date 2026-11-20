import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

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

export async function getDailyNotes(
  range: DailyNoteRange
): Promise<DailyNoteSummary[]> {
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
