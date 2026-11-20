import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  billingKeys,
  type BillingStatus,
} from "@/lib/services/api/billing/billing.api";
import {
  uploadDocument,
  type LocalUploadFile,
} from "@/lib/services/api/documents/documents.api";
import { documentQueryKeys } from "@/lib/services/api/documents/documents.queries";
import { libraryQueryKeys } from "@/lib/services/api/file-library/file-library.queries";
import { formatFileSize } from "@/lib/utils/format";
import { createId } from "@/lib/utils/id";

export type UploadState = "pending" | "uploading" | "completed" | "failed";

export type UploadEntry = {
  id: string;
  name: string;
  state: UploadState;
  /** 0–1 while uploading. */
  progress: number;
  error?: string;
  file: LocalUploadFile;
  folderId?: string;
  /** "File saya / Keluarga" — where the file lands. */
  destination: string;
};

export type UploadSnapshot = {
  entries: UploadEntry[];
  running: boolean;
};

/**
 * Library uploads live outside any screen, so they keep running (and stay
 * visible on every Files screen) while the user moves around the app.
 */
let snapshot: UploadSnapshot = { entries: [], running: false };
const listeners = new Set<() => void>();
let uploadSession = new AbortController();

function emit(next: UploadSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function patchEntry(id: string, patch: Partial<UploadEntry>) {
  emit({
    ...snapshot,
    entries: snapshot.entries.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry
    ),
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function useUploads(): UploadSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function maxFileBytes(queryClient: QueryClient): number | null {
  const billing = queryClient.getQueryData<BillingStatus>(billingKeys.status);

  return billing?.storage.maxFileBytes ?? null;
}

async function runQueue(queryClient: QueryClient) {
  if (snapshot.running) return;
  const { signal } = uploadSession;
  emit({ ...snapshot, running: true });

  try {
    while (!signal.aborted) {
      const next = snapshot.entries.find((entry) => entry.state === "pending");
      if (!next) break;

      const limit = maxFileBytes(queryClient);
      if (limit && next.file.size && next.file.size > limit) {
        patchEntry(next.id, {
          state: "failed",
          error: `Ukuran file melebihi batas ${formatFileSize(limit)}.`,
        });
        continue;
      }

      patchEntry(next.id, {
        state: "uploading",
        progress: 0,
        error: undefined,
      });
      let lastReported = 0;

      try {
        await uploadDocument({
          file: next.file,
          folderId: next.folderId,
          signal,
          onProgress: (fraction) => {
            // Re-render at most every few percent; progress events are frequent.
            if (
              signal.aborted ||
              (fraction - lastReported < 0.03 && fraction < 1)
            )
              return;
            lastReported = fraction;
            patchEntry(next.id, { progress: fraction });
          },
        });
        if (signal.aborted) return;
        patchEntry(next.id, { state: "completed", progress: 1 });
        for (const queryKey of [
          libraryQueryKeys.all,
          documentQueryKeys.all,
          billingKeys.status,
        ]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      } catch (error: unknown) {
        if (signal.aborted) return;
        console.warn("File upload failed; remaining files continue", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        patchEntry(next.id, {
          state: "failed",
          error:
            error instanceof Error && error.message
              ? error.message
              : "Unggahan gagal. Coba lagi.",
        });
      }
    }
  } finally {
    if (!signal.aborted) emit({ ...snapshot, running: false });
  }
}

/** Capture this before opening the picker so a late selection cannot cross accounts. */
export function libraryUploadSessionSignal(): AbortSignal {
  return uploadSession.signal;
}

/** Cancel in-flight requests and discard local file references on session changes. */
export function resetLibraryUploads() {
  uploadSession.abort();
  uploadSession = new AbortController();
  emit({ entries: [], running: false });
}

/** Queues files for upload into `folderId` (root when undefined). */
export function startUploads(
  files: LocalUploadFile[],
  options: {
    folderId?: string;
    destination: string;
    queryClient: QueryClient;
    session: AbortSignal;
  }
) {
  if (!files.length || options.session !== uploadSession.signal) return;
  // A finished batch is replaced; an active one keeps its rows.
  const kept = snapshot.running
    ? snapshot.entries
    : snapshot.entries.filter((entry) => entry.state !== "completed");

  emit({
    ...snapshot,
    entries: [
      ...kept,
      ...files.map((file) => ({
        id: createId(),
        name: file.name,
        state: "pending" as const,
        progress: 0,
        file,
        folderId: options.folderId,
        destination: options.destination,
      })),
    ],
  });
  void runQueue(options.queryClient);
}

export function retryFailedUploads(queryClient: QueryClient) {
  emit({
    ...snapshot,
    entries: snapshot.entries.map((entry) =>
      entry.state === "failed"
        ? { ...entry, state: "pending", progress: 0, error: undefined }
        : entry
    ),
  });
  void runQueue(queryClient);
}

/** Clears finished rows; uploads still in flight stay listed. */
export function dismissUploads() {
  emit({
    ...snapshot,
    entries: snapshot.entries.filter(
      (entry) => entry.state === "pending" || entry.state === "uploading"
    ),
  });
}
