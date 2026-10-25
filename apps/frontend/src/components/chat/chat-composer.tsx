import {
  ChatSourceEditor,
  type ChatSourceEditorHandle,
} from "./chat-source-editor";
import type { ChatSegment } from "./chat-source-types";
import { useQuery } from "@tanstack/react-query";
import {
  FileAudio,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  SendHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import type { SendMessageVariables } from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import {
  getDocument,
  type FileKind,
} from "@/lib/services/api/documents/documents.api";
import {
  documentQueryOptions,
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
};

type ChatComposerProps = {
  conversationId?: string;
  initialAttachmentId?: string;
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

async function waitForDocument(documentId: string, locale: SupportedLocale) {
  for (;;) {
    const document = await getDocument(documentId);
    if (document.status === "ready") return document;
    if (document.status === "failed")
      throw new Error(
        document.errorMessage ||
          (locale === "en"
            ? "File could not be processed."
            : "File tidak dapat diproses.")
      );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 2_000));
  }
}

function AttachmentIcon({ kind }: { kind: FileKind }) {
  const Icon =
    kind === "audio" ? FileAudio : kind === "image" ? FileImage : FileText;

  return <Icon className="size-4 shrink-0" aria-hidden="true" />;
}

export function ChatComposer({
  conversationId,
  initialAttachmentId,
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
  const libraryDocument = useQuery(
    documentQueryOptions(initialAttachmentId ?? "")
  );

  const lastSubmission = useRef<
    { signature: string; idempotencyKey: string } | undefined
  >(undefined);

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

  async function uploadAttachment(attachment: ComposerAttachment) {
    if (!attachment.file) return;
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
          : await waitForDocument(uploaded.id, locale);

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
              }
            : item
        )
      );
    } catch (error) {
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
    }
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).map((file) => ({
      localId: crypto.randomUUID(),
      name: file.name,
      kind: kindFromFile(file),
      status: "queued" as const,
      file,
    }));

    event.target.value = "";
    setAttachments((current) => [...current, ...selected]);
    for (const attachment of selected) await uploadAttachment(attachment);
  }

  function removeAttachment(localId: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.localId !== localId)
    );
    lastSubmission.current = undefined;
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
        embedded ? "bg-transparent" : "bg-canvas px-4 pt-2 pb-3 sm:px-6"
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
                className="flex min-h-9 max-w-full items-center gap-2 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm"
              >
                {attachment.status === "uploading" ? (
                  <LoaderCircle className="size-4 shrink-0 animate-spin text-brand-deep motion-reduce:animate-none" />
                ) : (
                  <AttachmentIcon kind={attachment.kind} />
                )}
                <span className="max-w-52 truncate">{attachment.name}</span>
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
                {attachment.errorMessage ? (
                  <span className="sr-only">{attachment.errorMessage}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {/* 52px tall (1px border + 8px padding + 34px row) with a 26px radius gives perfect half-circle ends. */}
        <div className="relative flex items-end gap-1 rounded-[26px] border border-hairline bg-surface-1 p-2 focus-within:border-ink/16">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(event) => void handleFiles(event)}
            accept=".pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.csv,.html,.json,image/*,audio/*"
            className="sr-only"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8.5 rounded-full"
            aria-label={locale === "en" ? "Add file" : "Tambahkan file"}
            disabled={disabled || isSending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip />
          </Button>
          <ChatSourceEditor
            ref={sourceEditorRef}
            locale={locale}
            disabled={!!disabled || isSending || submitting}
            embedded={embedded}
            onChange={(text, segments) => {
              if (errorMessage) onDraftChange?.();
              setContent(text);
              setSourceSegments(segments);
              lastSubmission.current = undefined;
            }}
            onSubmit={() => void submit()}
          />
          <Button
            type="submit"
            size="icon"
            className="size-8.5 rounded-full"
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
            <SendHorizontal />
          </Button>
        </div>
        {embedded ? composerState : null}
        <p id="composer-help" className="sr-only">
          {locale === "en"
            ? "Press Enter to send. Press Shift and Enter for a new line. Use the add file button to attach a document, image, or audio."
            : "Tekan Enter untuk mengirim. Tekan Shift dan Enter untuk membuat baris baru. Gunakan tombol tambahkan file untuk melampirkan dokumen, gambar, atau audio."}
        </p>
      </div>
    </form>
  );
}
