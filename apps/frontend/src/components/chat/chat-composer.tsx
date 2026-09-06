import { SendHorizontal } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SendMessageVariables } from "@/lib/services/api/conversations/conversations.api";

export function ChatComposer({
  conversationId,
  disabled,
  disabledReason,
  isSending,
  errorMessage,
  onDraftChange,
  onSend,
}: {
  conversationId?: string;
  disabled?: boolean;
  disabledReason?: string;
  isSending: boolean;
  errorMessage?: string;
  onSend: (values: SendMessageVariables) => Promise<void>;
  onDraftChange?: () => void;
}) {
  const [content, setContent] = useState("");
  const lastSubmission = useRef<
    { content: string; idempotencyKey: string } | undefined
  >(undefined);

  const normalizedContent = content.trim();
  const canSend = Boolean(normalizedContent) && !disabled && !isSending;

  async function submit() {
    if (!canSend) return;

    const idempotencyKey =
      lastSubmission.current?.content === normalizedContent
        ? lastSubmission.current.idempotencyKey
        : crypto.randomUUID();

    lastSubmission.current = { content: normalizedContent, idempotencyKey };

    try {
      await onSend({
        conversationId,
        content: normalizedContent,
        idempotencyKey,
      });
      setContent("");
      lastSubmission.current = undefined;
    } catch {
      // The mutation exposes a recoverable inline error and keeps this draft.
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
      className="border-t border-surface-1 bg-canvas px-4 py-4 sm:px-6"
      onSubmit={handleSubmit}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-3 rounded-xl border border-hairline bg-canvas p-2 transition-colors focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20">
          <Textarea
            rows={1}
            value={content}
            aria-label="Pesan untuk Sydia"
            aria-describedby="composer-help composer-state"
            placeholder="Tulis pesan untuk Sydia…"
            disabled={disabled || isSending}
            onChange={(event) => {
              if (errorMessage) onDraftChange?.();
              setContent(event.target.value);

              if (
                event.target.value.trim() !== lastSubmission.current?.content
              ) {
                lastSubmission.current = undefined;
              }
            }}
            onKeyDown={handleKeyDown}
            className="max-h-40 min-h-11 resize-none border-0 px-3 py-2.5 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            className="mb-0.5"
            aria-label={isSending ? "Mengirim pesan" : "Kirim pesan"}
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
              {errorMessage} Tekan kirim untuk mencoba lagi.
            </p>
          ) : disabledReason ? (
            <p className="text-ink-muted">{disabledReason}</p>
          ) : null}
        </div>
        <p id="composer-help" className="sr-only">
          Tekan Enter untuk mengirim. Tekan Shift dan Enter untuk membuat baris
          baru.
        </p>
      </div>
    </form>
  );
}
