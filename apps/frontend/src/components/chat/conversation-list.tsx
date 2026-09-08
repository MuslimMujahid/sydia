import { MessageSquareText, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationSummary } from "@/lib/services/api/conversations/conversations.api";
import { cn } from "@/lib/utils/cn";

function formatConversationTime(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function ConversationListSkeleton() {
  return (
    <div className="space-y-1 px-3" aria-hidden="true">
      {["first", "second", "third", "fourth"].map((item) => (
        <div key={item} className="space-y-3 rounded-md px-3 py-4">
          <div className="h-4 w-2/3 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function ConversationList({
  conversations,
  selectedConversationId,
  isLoading,
  errorMessage,
  disabled,
  onSelect,
  onRetry,
  onClose,
  onRequestDelete,
}: {
  conversations: ConversationSummary[];
  selectedConversationId: string | null | undefined;
  isLoading: boolean;
  errorMessage?: string;
  disabled?: boolean;
  onSelect: (conversationId: string) => void;
  onRetry: () => void;
  onClose?: () => void;
  onRequestDelete: (conversation: ConversationSummary) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex items-center gap-2 px-5 pt-7 pb-2">
        <h2 className="text-xs font-semibold text-ink-muted">Percakapan</h2>
        {!isLoading && !errorMessage ? (
          <span className="font-mono text-[11px] text-ink-muted">
            {conversations.length}
          </span>
        ) : null}
        {onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Tutup daftar percakapan"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {isLoading ? <ConversationListSkeleton /> : null}

        {errorMessage ? (
          <div
            className="mx-4 border-y border-destructive/30 py-5"
            role="alert"
          >
            <p className="text-sm text-ink-soft">{errorMessage}</p>
            <Button
              variant="dark-outline"
              size="sm"
              className="mt-4"
              onClick={onRetry}
            >
              <RotateCcw />
              Coba lagi
            </Button>
          </div>
        ) : null}

        {!isLoading && !errorMessage && conversations.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <MessageSquareText className="mx-auto size-6 text-brand-deep" />
            <p className="mt-4 font-display text-base font-semibold">
              Mulai dari pesan pertama
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Percakapan yang tersimpan akan muncul di sini.
            </p>
          </div>
        ) : null}

        {!isLoading && !errorMessage ? (
          <ul className="space-y-1 px-3">
            {conversations.map((conversation) => {
              const selected = conversation.id === selectedConversationId;
              const time = formatConversationTime(
                conversation.lastMessageAt ?? conversation.updatedAt
              );

              return (
                <li key={conversation.id}>
                  <div className="group flex items-stretch gap-1">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-current={selected ? "page" : undefined}
                      onClick={() => onSelect(conversation.id)}
                      className={cn(
                        "min-w-0 flex-1 rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
                        selected
                          ? "bg-surface-2 text-ink"
                          : "hover:bg-surface-1"
                      )}
                    >
                      <span className="block truncate text-sm font-medium">
                        {conversation.title?.trim() || "Percakapan baru"}
                      </span>
                      <span className="sr-only">
                        {time ? `Terakhir diperbarui ${time}. ` : ""}
                        {conversation.lastMessagePreview?.trim() ||
                          "Belum ada pesan"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Hapus percakapan ${conversation.title?.trim() || "baru"}`}
                      onClick={() => onRequestDelete(conversation)}
                      className="self-center rounded-sm p-2 text-ink-muted outline-none transition-colors hover:text-destructive focus-visible:text-destructive focus-visible:ring-3 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
