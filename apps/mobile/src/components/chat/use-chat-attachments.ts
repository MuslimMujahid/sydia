import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  type Document,
  type FileKind,
  type LocalUploadFile,
} from "@/lib/services/api/documents/documents.api";
import {
  documentQueryOptions,
  useDeleteDocument,
  useUploadDocument,
} from "@/lib/services/api/documents/documents.queries";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { createId } from "@/lib/utils/id";

export type ComposerAttachment = {
  localId: string;
  documentId?: string;
  name: string;
  kind: FileKind;
  status: "queued" | "uploading" | "processing" | "ready" | "error";
  /** Upload progress from 0 to 1 while uploading. */
  progress?: number;
  file?: LocalUploadFile;
  errorMessage?: string;
  skippedImageCount?: number;
};

/** Thrown when an attachment's work stops because it was removed or the screen closed. */
class AttachmentCancelledError extends Error {
  constructor() {
    super("Attachment processing was cancelled.");
    this.name = "AttachmentCancelledError";
  }
}

function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new AttachmentCancelledError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);

    function cancel() {
      clearTimeout(timer);
      reject(new AttachmentCancelledError());
    }

    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function waitForDocument(
  documentId: string,
  locale: SupportedLocale,
  signal: AbortSignal
): Promise<Document> {
  for (;;) {
    if (signal.aborted) throw new AttachmentCancelledError();
    const document = await getDocument(documentId, { signal }).catch(
      (error: unknown) => {
        if (signal.aborted) throw new AttachmentCancelledError();
        throw error;
      }
    );

    if (document.status === "ready") return document;
    if (document.status === "failed")
      throw new Error(
        document.errorMessage ||
          (locale === "en"
            ? "File could not be processed."
            : "File tidak dapat diproses.")
      );
    await pause(2_000, signal);
  }
}

export function skippedDocumentImages(document: Document): number {
  const count = document.structuredData?.skippedImageCount;

  return document.status === "ready" && typeof count === "number" ? count : 0;
}

export function kindFromMimeType(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";

  return "document";
}

type Options = {
  conversationId?: string;
  /** A library document opened with "Tanya Sydia" to attach right away. */
  initialAttachmentId?: string;
  locale: SupportedLocale;
};

/**
 * Chat attachments, mirroring the web composer: each file uploads, then is
 * polled until processed. Removing a file this composer uploaded also deletes
 * it, so an unsent file does not stay in the library; a library file is only
 * taken off the message.
 */
export function useChatAttachments({
  conversationId,
  initialAttachmentId,
  locale,
}: Options) {
  const [draftAttachments, setAttachments] = useState<ComposerAttachment[]>(
    () =>
      initialAttachmentId
        ? [
            {
              localId: `existing-${initialAttachmentId}`,
              documentId: initialAttachmentId,
              name: locale === "en" ? "File from library" : "File dari pustaka",
              kind: "document",
              status: "processing",
            },
          ]
        : []
  );
  const [discardError, setDiscardError] = useState<string>();
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const removed = useRef(new Set<string>());
  const work = useRef(new Map<string, AbortController>());
  const uploaded = useRef(new Map<string, string>());
  const libraryDocument = useQuery({
    ...documentQueryOptions(initialAttachmentId ?? ""),
    enabled: Boolean(initialAttachmentId),
  });

  useEffect(() => {
    const running = work.current;

    // Leaving the screen stops status checks. Unsent uploads stay in the
    // library; only an explicit removal deletes them.
    return () => {
      for (const controller of running.values()) controller.abort();
    };
  }, []);

  const libraryData = libraryDocument.data;
  const libraryError = libraryDocument.error;

  const attachments = draftAttachments.map((attachment): ComposerAttachment => {
    if (!initialAttachmentId || attachment.documentId !== initialAttachmentId)
      return attachment;
    if (libraryError)
      return {
        ...attachment,
        status: "error",
        errorMessage: libraryError.message,
      };
    if (!libraryData) return attachment;

    return {
      ...attachment,
      name: libraryData.title,
      kind: libraryData.file.kind,
      status: libraryData.status === "failed" ? "error" : libraryData.status,
      errorMessage: libraryData.errorMessage ?? undefined,
      skippedImageCount: skippedDocumentImages(libraryData),
    };
  });

  function update(localId: string, change: Partial<ComposerAttachment>) {
    setAttachments((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, ...change } : item
      )
    );
  }

  async function discardUpload(localId: string) {
    const documentId = uploaded.current.get(localId);
    if (!documentId) return;
    uploaded.current.delete(localId);

    try {
      await deleteMutation.mutateAsync(documentId);
    } catch (error) {
      console.error(
        "Removed chat attachment could not be deleted; it remains in the file library.",
        { documentId, error }
      );
      setDiscardError(
        locale === "en"
          ? "A removed file could not be deleted. It is still in your file library."
          : "File yang dihapus dari pesan belum bisa dihapus. File masih ada di pustaka file."
      );
    }
  }

  async function upload(attachment: ComposerAttachment) {
    const { localId, file } = attachment;
    if (!file || removed.current.has(localId)) return;
    // A retry replaces the earlier upload, which failed processing.
    void discardUpload(localId);
    const controller = new AbortController();
    work.current.set(localId, controller);
    update(localId, {
      status: "uploading",
      progress: 0,
      errorMessage: undefined,
    });

    try {
      const document = await uploadMutation.mutateAsync({
        file,
        conversationId,
        onProgress: (fraction) => update(localId, { progress: fraction }),
      });

      uploaded.current.set(localId, document.id);
      if (controller.signal.aborted) throw new AttachmentCancelledError();
      update(localId, {
        documentId: document.id,
        status: "processing",
        progress: undefined,
      });

      const ready =
        document.status === "ready"
          ? document
          : await waitForDocument(document.id, locale, controller.signal);

      update(localId, {
        documentId: ready.id,
        name: ready.title,
        kind: ready.file.kind,
        status: "ready",
        errorMessage: undefined,
        skippedImageCount: skippedDocumentImages(ready),
      });
    } catch (error) {
      if (error instanceof AttachmentCancelledError) return;
      console.warn("Chat attachment upload failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      update(localId, {
        status: "error",
        progress: undefined,
        errorMessage:
          error instanceof Error && error.message
            ? error.message
            : locale === "en"
              ? "Upload could not be completed."
              : "Unggahan tidak dapat diselesaikan.",
      });
    } finally {
      if (work.current.get(localId) === controller)
        work.current.delete(localId);
      if (removed.current.has(localId)) void discardUpload(localId);
    }
  }

  async function addFiles(files: LocalUploadFile[]) {
    if (!files.length) return;
    const selected: ComposerAttachment[] = files.map((file) => ({
      localId: createId(),
      name: file.name,
      kind: kindFromMimeType(file.mimeType),
      status: "queued",
      file,
    }));

    setDiscardError(undefined);
    setAttachments((current) => [...current, ...selected]);
    for (const attachment of selected) await upload(attachment);
  }

  function retry(localId: string) {
    const attachment = attachments.find((item) => item.localId === localId);
    if (attachment?.file) void upload(attachment);
  }

  function remove(localId: string) {
    removed.current.add(localId);
    setAttachments((current) =>
      current.filter((item) => item.localId !== localId)
    );
    const running = work.current.get(localId);
    // Running work deletes its own upload when it stops.
    if (running) running.abort();
    else void discardUpload(localId);
  }

  /** Sent files belong to the message now; removal no longer deletes them. */
  function clearSent() {
    setAttachments([]);
    uploaded.current.clear();
    setDiscardError(undefined);
  }

  const readyIds = attachments.flatMap((attachment) =>
    attachment.status === "ready" && attachment.documentId
      ? [attachment.documentId]
      : []
  );
  const hasPending = attachments.some(
    (attachment) =>
      attachment.status === "queued" ||
      attachment.status === "uploading" ||
      attachment.status === "processing"
  );

  return {
    attachments,
    readyIds,
    hasPending,
    discardError,
    addFiles,
    retry,
    remove,
    clearSent,
  };
}
