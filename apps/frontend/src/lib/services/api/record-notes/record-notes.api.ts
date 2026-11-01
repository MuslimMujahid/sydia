import { queryOptions } from "@tanstack/react-query";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type RecordColumn = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "datetime" | "boolean" | "choice";
  required: false;
  unit?: string;
  options?: string[];
};
export type RecordCell =
  | { raw: string; status: "typed"; value: string | boolean; timezone?: string }
  | { raw: string; status: "mismatched" };
export type RecordRow = {
  id: string;
  position: number;
  cells: Record<string, RecordCell>;
  sources: Array<{ ref: string; version?: string }>;
};
export type RecordMetadata = {
  id: string;
  title: string;
  description: string;
  columns: RecordColumn[];
  revision: number;
  rowCount: number;
  columnCount: number;
  updatedAt: string;
  path: string;
  parentId: string | null;
  mismatched: Record<string, number>;
  bounds: unknown;
};
export type RecordPage = {
  id: string;
  revision: number;
  rowCount: number;
  rows: RecordRow[];
  page: {
    from: number;
    to: number;
    offset: number;
    limit: number;
    first: string;
    last: string;
    next: string | null;
    previous: string | null;
  };
};
export type RecordChange =
  | { action: "restore_columns"; undoKey: string }
  | { action: "title"; title: string }
  | { action: "sort_rows"; columnId: string; direction: "asc" | "desc" }
  | {
      action: "paste_rows";
      updates: Array<{
        id: string;
        values: Record<string, string | boolean | null>;
      }>;
      additions: Array<{ values: Record<string, string | boolean | null> }>;
    }
  | { action: "schema"; columns: RecordColumn[]; confirmed?: boolean }
  | {
      action: "add_rows";
      beforeId?: string;
      afterId?: string;
      rows: Array<{ values: Record<string, string | boolean | null> }>;
    }
  | {
      action: "update_rows";
      rows: Array<{
        id: string;
        values: Record<string, string | boolean | null>;
      }>;
    }
  | { action: "delete_rows"; ids: string[] }
  | { action: "context"; description: string };

async function request<T>(
  method: "get" | "post",
  url: string,
  data?: unknown,
  failureMessage = "Tabel belum dapat dimuat atau disimpan. Coba lagi."
): Promise<T> {
  try {
    return (await api.request<ApiResponse<T>>({ method, url, data })).data.data;
  } catch (error) {
    const failure = toApiError(error, failureMessage);

    console.warn("Record request failed", { method, url, name: failure.name });
    throw failure;
  }
}

export const recordKeys = {
  metadata: (id: string) => ["records", id, "metadata"] as const,
  content: (id: string, cursor?: string) =>
    ["records", id, "content", cursor ?? "first"] as const,
};
export const recordMetadataOptions = (id: string) =>
  queryOptions({
    queryKey: recordKeys.metadata(id),
    queryFn: () =>
      request<RecordMetadata>(
        "get",
        `/record-notes/${encodeURIComponent(id)}/metadata`
      ),
    retry: false,
  });
export const recordContentOptions = (id: string, cursor?: string) =>
  queryOptions({
    queryKey: recordKeys.content(id, cursor),
    queryFn: () =>
      request<RecordPage>(
        "post",
        `/record-notes/${encodeURIComponent(id)}/content`,
        { limit: 12, ...(cursor ? { cursor } : {}) }
      ),
    retry: false,
  });

export function createRecordNote(input: {
  parentId: string | null;
  requestKey: string;
  title?: string;
  columns: RecordColumn[];
}) {
  return request<RecordMetadata>("post", "/record-notes", input);
}

export function mutateRecordNote(
  id: string,
  input: {
    revision: number;
    requestKey: string;
    sessionId: string;
    change: RecordChange;
  }
) {
  return request<
    RecordMetadata & { changedIds: string[]; saved: true; undoKey?: string }
  >("post", `/record-notes/${encodeURIComponent(id)}/mutations`, input);
}

export function getRecordPage(id: string, offset: number) {
  return request<RecordPage>(
    "post",
    `/record-notes/${encodeURIComponent(id)}/content`,
    { limit: 12, offset }
  );
}

export function getRecordPageCursor(id: string, cursor: string) {
  return request<RecordPage>(
    "post",
    `/record-notes/${encodeURIComponent(id)}/content`,
    { limit: 12, cursor }
  );
}

export function getRecordMetadata(id: string) {
  return request<RecordMetadata>(
    "get",
    `/record-notes/${encodeURIComponent(id)}/metadata`
  );
}

export function exportRecordNote(id: string) {
  return request<{ url: string; revision: number; filename: string }>(
    "post",
    `/record-notes/${encodeURIComponent(id)}/export`,
    undefined,
    "File CSV belum dapat disiapkan. Coba lagi."
  );
}

/** Fetch the actual exported file before reporting a download action as complete. */
export async function getRecordCsvDownload(url: string): Promise<Blob> {
  try {
    return (await api.get<Blob>(url, { responseType: "blob" })).data;
  } catch (error) {
    console.warn("Record CSV download failed");
    throw toApiError(error, "CSV belum dapat diunduh. Coba lagi.");
  }
}

/** Bound reconciliation when another editor saves between the separate reads. */
export async function getRecordSavedView(
  id: string,
  offset: number,
  knownMetadata?: RecordMetadata
): Promise<{ metadata: RecordMetadata; content: RecordPage }> {
  const MAX_VIEW_READS = 3;
  let metadata = knownMetadata ?? (await getRecordMetadata(id));

  for (let attempt = 0; attempt < MAX_VIEW_READS; attempt++) {
    const pageOffset = Math.min(
      offset,
      Math.max(0, Math.floor((Math.max(1, metadata.rowCount) - 1) / 12) * 12)
    );

    const content = await getRecordPage(id, pageOffset);
    if (metadata.revision === content.revision) return { metadata, content };
    console.warn(
      "Saved record view changed between schema and content reads; retrying within bound.",
      { attempt: attempt + 1, maxAttempts: MAX_VIEW_READS }
    );
    if (attempt + 1 < MAX_VIEW_READS) metadata = await getRecordMetadata(id);
  }

  throw new Error(
    "Tabel terus berubah saat dimuat. Draf tetap tersedia; coba muat ulang."
  );
}
