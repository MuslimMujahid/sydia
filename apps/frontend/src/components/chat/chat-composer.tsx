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
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SendMessageVariables } from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import {
  getDocument,
  type FileKind,
} from "@/lib/services/api/documents/documents.api";
import { useUploadDocument } from "@/lib/services/api/documents/documents.queries";

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
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadDocument();
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
              status: "ready",
            },
          ]
    );
  }, [initialAttachmentId, locale]);

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
    !isSending;

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
                name: document.file.originalName,
                kind: document.file.kind,
                status: "ready",
                errorMessage: undefined,
              }
            : item
        )
      );
    } catch (error) {
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

    if (!canSend) return;
    const attachmentIds = readyAttachments.flatMap((attachment) =>
      attachment.documentId ? [attachment.documentId] : []
    );

    const signature = `${submittedContent}\u0000${attachmentIds.join(",")}`;
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
      });
      setContent("");
      setAttachments([]);
      lastSubmission.current = undefined;
    } catch {
      // The mutation exposes a recoverable inline error and keeps the draft.
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      className={
        embedded
          ? "bg-transparent"
          : "border-t border-surface-1 bg-canvas px-4 py-4 sm:px-6"
      }
      onSubmit={handleSubmit}
    >
      <div className={embedded ? "w-full" : "mx-auto max-w-3xl"}>
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
                {attachment.status === "error" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${locale === "en" ? "Try uploading again" : "Coba unggah ulang"} ${attachment.name}`}
                    onClick={() => void uploadAttachment(attachment)}
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
        <div className="flex items-end gap-2 rounded-lg border border-ink/16 bg-canvas p-2 shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(event) => void handleFiles(event)}
            accept=".pdf,.doc,.docx,.txt,.md,image/*,audio/*"
            className="sr-only"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-0.5"
            aria-label={locale === "en" ? "Add file" : "Tambahkan file"}
            disabled={disabled || isSending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip />
          </Button>
          <Textarea
            rows={1}
            value={content}
            aria-label={
              locale === "en" ? "Message for Sydia" : "Pesan untuk Sydia"
            }
            aria-describedby="composer-help composer-state"
            placeholder={
              locale === "en"
                ? "Write a message or attach a file…"
                : "Tulis pesan atau lampirkan file…"
            }
            disabled={disabled || isSending}
            onChange={(event) => {
              if (errorMessage) onDraftChange?.();
              setContent(event.target.value);
              lastSubmission.current = undefined;
            }}
            onKeyDown={handleKeyDown}
            className="max-h-40 min-h-11 resize-none border-0 px-2 py-2.5 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            className="mb-0.5"
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
        <div
          id="composer-state"
          className="mt-2 min-h-5 text-sm"
          aria-live="polite"
        >
          {errorMessage ? (
            <p className="text-destructive" role="alert">
              {errorMessage}{" "}
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
        <p id="composer-help" className="sr-only">
          {locale === "en"
            ? "Press Enter to send. Press Shift and Enter for a new line. Use the add file button to attach a document, image, or audio."
            : "Tekan Enter untuk mengirim. Tekan Shift dan Enter untuk membuat baris baru. Gunakan tombol tambahkan file untuk melampirkan dokumen, gambar, atau audio."}
        </p>
      </div>
    </form>
  );
}
