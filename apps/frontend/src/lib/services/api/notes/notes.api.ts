import { queryOptions } from "@tanstack/react-query";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import { getDailyNote, type TiptapDoc } from "../daily-notes/daily-notes.api";

export type WorkspaceItem = {
  id: string;
  kind: "note" | "folder";
  title: string;
  parentId: string | null;
  revision: number;
  path: string;
  trashedAt: string | null;
  trashBatchId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type NoteEntry = {
  ref: string;
  id: string;
  kind: "note" | "daily";
  title: string;
  path: string;
  parentId: string | null;
  excerpt: string;
  updatedAt: string;
};
export type NotesWorkspace = { items: WorkspaceItem[]; notes: NoteEntry[] };
export type WorkspaceNote = {
  ref: string;
  title: string;
  parentId: string | null;
  content: TiptapDoc;
  version: string | null;
  updatedAt: string | null;
  sourceType: string;
};
export type NoteDraft = Pick<WorkspaceNote, "title" | "content">;
export type ItemMutation = {
  id: string;
  revision: number;
  action: "update" | "trash" | "restore" | "delete";
  parentId?: string | null;
  title?: string;
};

async function request<T>(
  method: "get" | "post" | "patch" | "put",
  url: string,
  data?: unknown,
  params?: Record<string, string | undefined>
): Promise<T> {
  try {
    return (
      await api.request<ApiResponse<T>>({
        method,
        url,
        data,
        params,
        timeout: 15_000,
      })
    ).data.data;
  } catch (error) {
    console.warn("Notes request failed", { method, url, error });
    throw toApiError(
      error,
      "Catatan tidak dapat dimuat atau disimpan. Coba lagi."
    );
  }
}

export const notesKeys = {
  all: ["notes"] as const,
  workspace: ["notes", "workspace"] as const,
  detail: (ref: string) => ["notes", "detail", ref] as const,
};
export const workspaceQueryOptions = () =>
  queryOptions({
    queryKey: notesKeys.workspace,
    queryFn: () => request<NotesWorkspace>("get", "/notes"),
    refetchInterval: 5000,
  });
export const workspaceNoteQueryOptions = (ref: string) =>
  queryOptions({
    queryKey: notesKeys.detail(ref),
    queryFn: () => getWorkspaceNote(ref),
    refetchInterval: 5000,
    retry: false,
  });

export async function getWorkspaceNote(ref: string): Promise<WorkspaceNote> {
  if (ref.startsWith("daily:")) {
    const date = ref.slice(6);
    const note = await getDailyNote(date);

    return {
      ref,
      title: date,
      parentId: null,
      content: note?.content ?? { type: "doc", content: [] },
      version: note?.updatedAt ?? null,
      updatedAt: note?.updatedAt ?? null,
      sourceType: note?.source.type ?? "dashboard",
    };
  }

  const item = await request<
    WorkspaceItem & { content: TiptapDoc; sourceType: string }
  >("get", `/notes/items/${encodeURIComponent(ref.slice(7))}`);

  return {
    ref,
    title: item.title,
    parentId: item.parentId,
    content: item.content,
    version: String(item.revision),
    updatedAt: item.updatedAt,
    sourceType: item.sourceType,
  };
}

export async function saveWorkspaceNote(
  note: WorkspaceNote,
  draft: NoteDraft
): Promise<WorkspaceNote> {
  if (note.ref.startsWith("daily:")) {
    const result = await request<{ note: { updatedAt: string } | null }>(
      "put",
      `/daily-notes/${encodeURIComponent(note.ref.slice(6))}`,
      { content: draft.content, expectedUpdatedAt: note.version }
    );

    return {
      ...note,
      ...draft,
      version: result.note?.updatedAt ?? null,
      updatedAt: result.note?.updatedAt ?? null,
      sourceType: "dashboard",
    };
  }

  const result = await request<WorkspaceItem>(
    "patch",
    `/notes/items/${encodeURIComponent(note.ref.slice(7))}`,
    {
      title: draft.title,
      content: draft.content,
      revision: Number(note.version),
    }
  );

  return {
    ...note,
    ...draft,
    parentId: result.parentId,
    version: String(result.revision),
    updatedAt: result.updatedAt,
    sourceType: "dashboard",
  };
}

export function createWorkspaceItem(input: {
  kind: "note" | "folder";
  parentId: string | null;
  title?: string;
  requestKey: string;
}) {
  return request<WorkspaceItem>("post", "/notes/items", input);
}

export function mutateWorkspaceItem({ id, action, ...input }: ItemMutation) {
  return request<WorkspaceItem>(
    action === "update" ? "patch" : "post",
    `/notes/items/${encodeURIComponent(id)}${action === "update" ? "" : `/${action}`}`,
    input
  );
}

export function searchWorkspaceNotes(
  query: string,
  kind?: string,
  folderId?: string
) {
  return request<NoteEntry[]>("get", "/notes/search", undefined, {
    query,
    kind,
    folderId,
  });
}

export function getNoteBacklinks(target: string) {
  return request<NoteEntry[]>("get", "/notes/backlinks", undefined, { target });
}
