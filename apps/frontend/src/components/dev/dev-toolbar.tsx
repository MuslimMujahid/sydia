import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Code2, LoaderCircle, MessageSquare, Send, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  sendDevNotification,
  type DevNotificationKind,
} from "@/lib/services/api/dev/dev.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";

interface DevToolbarProps {
  locale: SupportedLocale;
}

const ACTION_CLASS_NAME =
  "flex min-h-10 w-full items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-normal text-ink-muted outline-none hover:bg-surface-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50";

export function DevToolbar({ locale }: DevToolbarProps) {
  const en = locale === "en";
  const mutation = useMutation({
    mutationFn: sendDevNotification,
    retry: false,
  });

  function send(kind: DevNotificationKind) {
    if (mutation.isPending) return;
    // Retrying an uncertain send must not create another delivery.
    const requestId =
      mutation.isError && mutation.variables.kind === kind
        ? mutation.variables.requestId
        : crypto.randomUUID();

    mutation.mutate({ kind, requestId });
  }

  const result = mutation.data;
  const message = result
    ? result.status === "skipped_user_missing"
      ? en
        ? "Account not found. Sign in again."
        : "Akun tidak ditemukan. Masuk kembali."
      : result.status === "skipped_disabled" ||
          (result.status === "queued" && result.deliveryCount === 0)
        ? en
          ? "Notifications are disabled in settings."
          : "Notifikasi dinonaktifkan di pengaturan."
        : result.status === "nothing_due"
          ? en
            ? "No tasks are due for follow-up."
            : "Tidak ada tugas jatuh tempo untuk tindak lanjut."
          : null
    : null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 size-11 rounded-full shadow-card"
            aria-label={en ? "Development tools" : "Alat pengembangan"}
          />
        }
      >
        <Code2 aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-64 space-y-1 p-1.5 motion-reduce:transition-none"
        aria-label={en ? "Development tools" : "Alat pengembangan"}
      >
        <div aria-busy={mutation.isPending}>
          <Button
            variant="ghost"
            size="sm"
            className={ACTION_CLASS_NAME}
            disabled={mutation.isPending}
            onClick={() => send("daily-brief")}
          >
            {mutation.isPending && mutation.variables.kind === "daily-brief" ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Sun aria-hidden="true" />
            )}
            {en ? "Send daily brief" : "Kirim ringkasan harian"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={ACTION_CLASS_NAME}
            disabled={mutation.isPending}
            onClick={() => send("follow-up")}
          >
            {mutation.isPending && mutation.variables.kind === "follow-up" ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Send aria-hidden="true" />
            )}
            {en ? "Send follow-up" : "Kirim tindak lanjut"}
          </Button>
          <Link to="/chats" className={ACTION_CLASS_NAME}>
            <MessageSquare className="size-4" aria-hidden="true" />
            {en ? "Chat previews" : "Pratinjau chat"}
          </Link>
        </div>
        {mutation.isPending ? (
          <p role="status" className="px-3 pb-2 text-xs text-ink-muted">
            {en ? "Queuing notification…" : "Mengantrekan notifikasi…"}
          </p>
        ) : null}
        {mutation.error ? (
          <p role="alert" className="px-3 pb-2 text-sm text-destructive">
            {mutation.error.message}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="px-3 pb-2 text-xs text-ink-muted">
            {message}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
