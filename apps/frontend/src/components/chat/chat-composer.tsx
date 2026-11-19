import {
  ChatSourceEditor,
  type ChatSourceEditorHandle,
} from "./chat-source-editor";
import type { ChatSegment } from "./chat-source-types";
import { ChatStarters } from "./chat-starters";
import { useQuery } from "@tanstack/react-query";
import {
  FileAudio,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  ArrowUp,
  X,
} from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type Ref,
} from "react";
import { Button } from "@/components/ui/button";
import {
  formatSkippedDocumentImages,
  skippedDocumentImages,
} from "@/components/documents/document-image-warning";
import type { SendMessageVariables } from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import {
  getDocument,
  type FileKind,
} from "@/lib/services/api/documents/documents.api";
import {
  documentQueryOptions,
  useDeleteDocument,
  useUploadDocument,
} from "@/lib/services/api/documents/documents.queries";

export type ComposerAttachment = {
  localId: string;
  documentId?: string;
  name: string;
  kind: FileKind;
  status: "queued" | "uploading" | "processing" | "ready" | "error";
  file?: File;
  errorMessage?: string;
  skippedImageCount?: number;
};

export type ChatComposerHandle = {
  addFiles: (files: File[]) => Promise<void>;
};

type ChatComposerProps = {
  ref?: Ref<ChatComposerHandle>;
  conversationId?: string;
  initialAttachmentId?: string;
  /** Draft text to start with, e.g. an example opened from an empty page. */
  initialDraft?: string;
  disabled?: boolean;
  disabledReason?: string;
  isSending: boolean;
  errorMessage?: string;
  locale: SupportedLocale;
  onDraftChange?: () => void;
  embedded?: boolean;
  onSend: (values: SendMessageVariables) => Promise<void>;
};

function kindFromFile(file: File): FileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";

  return "document";
}

/** Thrown when an attachment's work stops because it was removed or the composer closed. */
class AttachmentCancelledError extends Error {
  constructor() {
    super("Attachment processing was cancelled.");
    this.name = "AttachmentCancelledError";
  }
}

function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new AttachmentCancelledError());
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);

    function cancel() {
      window.clearTimeout(timer);
      reject(new AttachmentCancelledError());
    }

    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function waitForDocument(
  documentId: string,
  locale: SupportedLocale,
  signal: AbortSignal
) {
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

function AttachmentIcon({ kind }: { kind: FileKind }) {
  const Icon =
    kind === "audio" ? FileAudio : kind === "image" ? FileImage : FileText;

  return <Icon className="size-4 shrink-0" aria-hidden="true" />;
}

export function ChatComposer({
  ref,
  conversationId,
  initialAttachmentId,
  initialDraft,
  disabled,
  disabledReason,
  isSending,
  errorMessage,
  locale,
  onDraftChange,
  embedded = false,
  onSend,
}: ChatComposerProps) {
  const [content, setContent] = useState("");
  const [sourceSegments, setSourceSegments] = useState<ChatSegment[]>([]);
  const sourceEditorRef = useRef<ChatSourceEditorHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  // Removed attachments stay listed here so an upload or status check that is
  // still running can see the removal and stop, or delete what it created.
  const removedAttachments = useRef(new Set<string>());
  const attachmentWork = useRef(new Map<string, AbortController>());
  const uploadedDocuments = useRef(new Map<string, string>());
  const [discardError, setDiscardError] = useState<string>();
  const libraryDocument = useQuery(
    documentQueryOptions(initialAttachmentId ?? "")
  );

  const lastSubmission = useRef<
    { signature: string; idempotencyKey: string } | undefined
  >(undefined);

  useEffect(() => {
    const work = attachmentWork.current;

    // Leaving the composer stops status checks. Unsent uploads stay in the
    // library; only an explicit removal deletes them.
    return () => {
      for (const controller of work.values()) controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!initialAttachmentId) return;
    setAttachments((current) =>
      current.some(
        (attachment) => attachment.documentId === initialAttachmentId
      )
        ? current
        : [
            ...current,
            {
              localId: `existing-${initialAttachmentId}`,
              documentId: initialAttachmentId,
              name: locale === "en" ? "File from library" : "File dari pustaka",
              kind: "document",
              status: "processing",
            },
          ]
    );
  }, [initialAttachmentId, locale]);

  useEffect(() => {
    if (!initialAttachmentId) return;
    const document = libraryDocument.data;
    if (!document && !libraryDocument.error) return;

    setAttachments((current) =>
      current.map((attachment) => {
        if (attachment.documentId !== initialAttachmentId) return attachment;
        if (libraryDocument.error)
          return {
            ...attachment,
            status: "error",
            errorMessage: libraryDocument.error.message,
          };
        if (!document) return attachment;

        return {
          ...attachment,
          name: document.title,
          kind: document.file.kind,
          status: document.status === "failed" ? "error" : document.status,
          errorMessage: document.errorMessage ?? undefined,
          skippedImageCount: skippedDocumentImages(document),
        };
      })
    );
  }, [initialAttachmentId, libraryDocument.data, libraryDocument.error]);

  const normalizedContent = content.trim();
  const readyAttachments = attachments.filter(
    (attachment) => attachment.status === "ready" && attachment.documentId
  );

  const hasPendingUpload = attachments.some(
    (attachment) =>
      attachment.status === "queued" ||
      attachment.status === "uploading" ||
      attachment.status === "processing"
  );

  const canSend =
    Boolean(normalizedContent || readyAttachments.length) &&
    !hasPendingUpload &&
    !disabled &&
    !isSending &&
    !submitting;

  async function discardUpload(localId: string) {
    const documentId = uploadedDocuments.current.get(localId);
    if (!documentId) return;
    uploadedDocuments.current.delete(localId);

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

  async function uploadAttachment(attachment: ComposerAttachment) {
    const { localId } = attachment;
    if (!attachment.file || removedAttachments.current.has(localId)) return;
    // A retry replaces the earlier upload, which failed processing.
    void discardUpload(localId);
    const controller = new AbortController();
    attachmentWork.current.set(localId, controller);
    setAttachments((current) =>
      current.map((item) =>
        item.localId === attachment.localId
          ? { ...item, status: "uploading", errorMessage: undefined }
          : item
      )
    );

    try {
      const uploaded = await uploadMutation.mutateAsync({
        file: attachment.file,
        conversationId,
      });

      uploadedDocuments.current.set(localId, uploaded.id);
      if (controller.signal.aborted) throw new AttachmentCancelledError();

      setAttachments((current) =>
        current.map((item) =>
          item.localId === attachment.localId
            ? { ...item, documentId: uploaded.id, status: "processing" }
            : item
        )
      );
      const document =
        uploaded.status === "ready"
          ? uploaded
          : await waitForDocument(uploaded.id, locale, controller.signal);

      setAttachments((current) =>
        current.map((item) =>
          item.localId === attachment.localId
            ? {
                ...item,
                documentId: document.id,
                name: document.title,
                kind: document.file.kind,
                status: "ready",
                errorMessage: undefined,
                skippedImageCount: skippedDocumentImages(document),
              }
            : item
        )
      );
    } catch (error) {
      if (error instanceof AttachmentCancelledError) return;
      console.warn("Chat attachment upload failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setAttachments((current) =>
        current.map((item) =>
          item.localId === attachment.localId
            ? {
                ...item,
                status: "error",
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : locale === "en"
                      ? "Upload could not be completed."
                      : "Unggahan tidak dapat diselesaikan.",
              }
            : item
        )
      );
    } finally {
      if (attachmentWork.current.get(localId) === controller)
        attachmentWork.current.delete(localId);
      if (removedAttachments.current.has(localId)) void discardUpload(localId);
    }
  }

  async function addFiles(files: File[]) {
    if (files.length === 0 || disabled || isSending || submittingRef.current)
      return;

    const selected = files.map((file) => ({
      localId: crypto.randomUUID(),
      name: file.name,
      kind: kindFromFile(file),
      status: "queued" as const,
      file,
    }));

    setDiscardError(undefined);
    setAttachments((current) => [...current, ...selected]);
    for (const attachment of selected) await uploadAttachment(attachment);
  }

  useImperativeHandle(ref, () => ({ addFiles }));

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void addFiles(files);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled || isSending || submittingRef.current) return;
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (images.length === 0) return;

    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    void addFiles(images);
  }

  /**
   * Removing a file this composer uploaded also deletes it, so a file that was
   * never sent does not stay in the library or keep being processed. A file
   * attached from the library is only taken off the message.
   */
  function removeAttachment(localId: string) {
    removedAttachments.current.add(localId);
    setAttachments((current) =>
      current.filter((attachment) => attachment.localId !== localId)
    );
    lastSubmission.current = undefined;
    const work = attachmentWork.current.get(localId);
    // Running work deletes its own upload when it stops.
    if (work) work.abort();
    else void discardUpload(localId);
  }

  async function submit() {
    const submittedContent =
      normalizedContent ||
      (locale === "en"
        ? `Use the ${readyAttachments.length === 1 ? "attached file" : `${readyAttachments.length} attached files`} for this.`
        : `Gunakan ${readyAttachments.length === 1 ? "file terlampir" : `${readyAttachments.length} file terlampir`} ini.`);

    if (!canSend || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError(undefined);
    const attachmentIds = readyAttachments.flatMap((attachment) =>
      attachment.documentId ? [attachment.documentId] : []
    );

    const signature = JSON.stringify([
      submittedContent,
      attachmentIds,
      sourceSegments,
    ]);

    const idempotencyKey =
      lastSubmission.current?.signature === signature
        ? lastSubmission.current.idempotencyKey
        : crypto.randomUUID();

    lastSubmission.current = { signature, idempotencyKey };

    try {
      await onSend({
        conversationId,
        content: submittedContent,
        idempotencyKey,
        attachmentIds,
        sourceSegments: sourceSegments.some(
          (segment) => segment.type === "source"
        )
          ? sourceSegments
          : undefined,
      });
      setContent("");
      setSourceSegments([]);
      sourceEditorRef.current?.clear();
      setAttachments([]);
      // Sent files belong to the message now; removal no longer deletes them.
      uploadedDocuments.current.clear();
      setDiscardError(undefined);
      lastSubmission.current = undefined;
    } catch (error) {
      console.warn("Chat submission failed; composer draft retained", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setSubmissionError(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Message could not be sent."
            : "Pesan belum dapat dikirim."
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  // The home message box keeps its status line below it. The docked box sits
  // near the bottom edge, so its status line goes above it, small and centered.
  const composerState = (
    <div
      id="composer-state"
      className={
        embedded ? "mt-2 min-h-5 text-sm" : "text-center text-xs has-[p]:mb-2"
      }
      aria-live="polite"
    >
      {errorMessage || submissionError ? (
        <p className="text-destructive" role="alert">
          {errorMessage || submissionError}{" "}
          {locale === "en"
            ? "Press send to try again."
            : "Tekan kirim untuk mencoba lagi."}
        </p>
      ) : discardError ? (
        <p className="text-destructive" role="alert">
          {discardError}
        </p>
      ) : hasPendingUpload ? (
        <p className="text-ink-muted">
          {locale === "en"
            ? "Wait until all attachments finish uploading."
            : "Tunggu hingga semua lampiran selesai diunggah."}
        </p>
      ) : disabledReason ? (
        <p className="text-ink-muted">{disabledReason}</p>
      ) : null}
    </div>
  );

  return (
    <form
      className={
        embedded ? "bg-transparent" : "bg-canvas px-4 pt-2 pb-4 sm:px-6"
      }
      onSubmit={handleSubmit}
    >
      <div className={embedded ? "w-full" : "mx-auto max-w-3xl"}>
        {embedded ? null : composerState}
        {attachments.length ? (
          <ul
            className="mb-3 flex flex-wrap gap-2"
            aria-label={
              locale === "en" ? "Message attachments" : "Lampiran pesan"
            }
          >
            {attachments.map((attachment) => (
              <li
                key={attachment.localId}
                className="flex min-h-9 max-w-full flex-wrap items-center gap-x-2 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm"
              >
                {attachment.status === "uploading" ? (
                  <LoaderCircle className="size-4 shrink-0 animate-spin text-brand-deep motion-reduce:animate-none" />
                ) : (
                  <AttachmentIcon kind={attachment.kind} />
                )}
                <span className="min-w-0 max-w-52 truncate">
                  {attachment.name}
                </span>
                <span
                  className={
                    attachment.status === "error"
                      ? "text-destructive"
                      : "text-ink-muted"
                  }
                >
                  {attachment.status === "queued"
                    ? locale === "en"
                      ? "Waiting"
                      : "Menunggu"
                    : attachment.status === "uploading"
                      ? locale === "en"
                        ? "Uploading"
                        : "Mengunggah"
                      : attachment.status === "processing"
                        ? locale === "en"
                          ? "Processing"
                          : "Memproses"
                        : attachment.status === "error"
                          ? locale === "en"
                            ? "Failed"
                            : "Gagal"
                          : locale === "en"
                            ? "Ready"
                            : "Siap"}
                </span>
                {attachment.status === "error" &&
                (attachment.file || libraryDocument.isError) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${locale === "en" ? "Try again" : "Coba lagi"} ${attachment.name}`}
                    onClick={() => {
                      if (attachment.file) void uploadAttachment(attachment);
                      else void libraryDocument.refetch();
                    }}
                  >
                    <RefreshCcw />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${locale === "en" ? "Remove attachment" : "Hapus lampiran"} ${attachment.name}`}
                  onClick={() => removeAttachment(attachment.localId)}
                >
                  <X />
                </Button>
                {attachment.status === "error" && attachment.errorMessage ? (
                  <span
                    className="basis-full pb-0.5 text-xs text-destructive"
                    role="alert"
                  >
                    {attachment.errorMessage}
                  </span>
                ) : null}
                {attachment.status === "ready" &&
                attachment.skippedImageCount ? (
                  <span
                    className="basis-full pb-0.5 text-xs text-ink-muted"
                    role="status"
                  >
                    {formatSkippedDocumentImages(
                      attachment.skippedImageCount,
                      locale
                    )}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {/* A raised card: the writing area on top, its tools on a second row. */}
        <div
          data-embedded={embedded}
          className="composer-shell flex flex-col gap-1 rounded-lg p-2.5"
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFiles}
            accept=".pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.csv,.html,.json,image/*,audio/*"
            className="sr-only"
          />
          <ChatSourceEditor
            ref={sourceEditorRef}
            locale={locale}
            disabled={!!disabled || isSending || submitting}
            embedded={embedded}
            onPaste={handlePaste}
            onChange={(text, segments) => {
              if (errorMessage) onDraftChange?.();
              setContent(text);
              setSourceSegments(segments);
              lastSubmission.current = undefined;
            }}
            onSubmit={() => void submit()}
            initialText={initialDraft}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="dark-outline"
              size="icon"
              className="size-9 rounded-full border-hairline text-ink-muted hover:border-ink/16 hover:bg-ink/5 [&_svg]:transition-[rotate] [&_svg]:duration-200 [&_svg]:ease-out hover:[&_svg]:-rotate-12"
              aria-label={locale === "en" ? "Add file" : "Tambahkan file"}
              disabled={disabled || isSending || submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </Button>
            <Button
              type="submit"
              size="icon"
              className="size-9 rounded-full transition-[scale,filter] active:scale-90 [&_svg]:transition-[translate] [&_svg]:duration-200 [&_svg]:ease-out hover:[&_svg]:-translate-y-0.5"
              aria-label={
                isSending
                  ? locale === "en"
                    ? "Sending message"
                    : "Mengirim pesan"
                  : locale === "en"
                    ? "Send message"
                    : "Kirim pesan"
              }
              disabled={!canSend}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
        {embedded ? composerState : null}
        {embedded ? (
          <div className="mt-1">
            <ChatStarters
              locale={locale}
              hidden={Boolean(content) || attachments.length > 0}
              disabled={disabled || isSending || submitting}
              onPick={(draft) => sourceEditorRef.current?.setText(draft)}
            />
          </div>
        ) : null}
        <p id="composer-help" className="sr-only">
          {locale === "en"
            ? "Press Enter to send. Press Shift and Enter for a new line. Use the add file button to attach a document, image, or audio."
            : "Tekan Enter untuk mengirim. Tekan Shift dan Enter untuk membuat baris baru. Gunakan tombol tambahkan file untuk melampirkan dokumen, gambar, atau audio."}
        </p>
      </div>
    </form>
  );
}
