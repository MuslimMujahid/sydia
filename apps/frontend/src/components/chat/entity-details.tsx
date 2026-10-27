import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Inbox,
  LoaderCircle,
  RotateCcw,
  Trash2,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect } from "react";
import { dayKeyInZone } from "@/components/calendar/calendar-date";
import { Button } from "@/components/ui/button";
import { PopoverTitle } from "@/components/ui/popover";
import { calendarEventsQueryOptions } from "@/lib/services/api/calendar/calendar.queries";
import { getDocumentContentUrl } from "@/lib/services/api/documents/documents.api";
import { documentQueryOptions } from "@/lib/services/api/documents/documents.queries";
import {
  reminderQueryOptions,
  useDeleteReminder,
  useSnoozeReminder,
} from "@/lib/services/api/reminders/reminders.queries";
import {
  taskQueryOptions,
  useSetTaskStatus,
} from "@/lib/services/api/tasks/tasks.queries";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { formatFileSize } from "@/lib/utils/format";
import { googleMeetJoinUrl, type ChatEntity } from "./chat-entities";
import {
  formatAllDayEventRange,
  formatEntityRecurrence,
} from "./entity-format";

type DetailsProps = {
  entity: ChatEntity;
  locale: SupportedLocale;
  timezone: string;
};
const STATUS_LABELS = {
  en: {
    inbox: "Inbox",
    done: "Completed",
    cancelled: "Cancelled",
    confirmed: "Confirmed",
    tentative: "Tentative",
    processing: "Processing",
    ready: "Ready",
    failed: "Processing failed",
  },
  id: {
    inbox: "Inbox",
    done: "Selesai",
    cancelled: "Dibatalkan",
    confirmed: "Dikonfirmasi",
    tentative: "Sementara",
    processing: "Diproses",
    ready: "Siap digunakan",
    failed: "Pemrosesan gagal",
  },
};

function when(value: string, locale: SupportedLocale, timezone: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function LoadingDetails({
  entity,
  locale,
}: Pick<DetailsProps, "entity" | "locale">) {
  return (
    <>
      <PopoverTitle className="break-words">{entity.title}</PopoverTitle>
      <p
        className="mt-3 flex items-center gap-2 text-sm text-ink-muted"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        {locale === "en" ? "Loading details…" : "Memuat rincian…"}
      </p>
    </>
  );
}

function DetailsError({
  title,
  error,
  onRetry,
  locale,
}: {
  title: string;
  error: Error;
  onRetry: () => void;
  locale: SupportedLocale;
}) {
  useEffect(() => {
    console.warn("Chat entity details could not be loaded", {
      name: error.name,
    });
  }, [error]);

  return (
    <>
      <PopoverTitle className="break-words">{title}</PopoverTitle>
      <p className="mt-3 text-sm text-destructive" role="alert">
        {error.message}
      </p>
      <Button size="sm" variant="ghost" className="mt-3" onClick={onRetry}>
        <RotateCcw />
        {locale === "en" ? "Try again" : "Coba lagi"}
      </Button>
    </>
  );
}

function MutationError({ error }: { error: Error | null }) {
  useEffect(() => {
    if (error) console.warn("Chat entity action failed", { name: error.name });
  }, [error]);

  return error ? (
    <p className="mt-3 text-sm text-destructive" role="alert">
      {error.message}
    </p>
  ) : null;
}

function TaskDetails({ entity, locale, timezone }: DetailsProps) {
  const query = useQuery({ ...taskQueryOptions(entity.id), retry: false });
  const mutation = useSetTaskStatus();
  if (query.isPending)
    return <LoadingDetails entity={entity} locale={locale} />;
  if (query.isError)
    return (
      <DetailsError
        title={entity.title}
        error={query.error}
        onRetry={() => void query.refetch()}
        locale={locale}
      />
    );
  const task = query.data;
  const done = task.status === "done";

  return (
    <>
      <PopoverTitle className="break-words">{task.title}</PopoverTitle>
      <p className="mt-2 text-sm text-ink-muted">
        {STATUS_LABELS[locale][task.status]}
      </p>
      {task.dueAt ? (
        <p className="mt-1 text-sm text-ink-muted">
          {when(task.dueAt, locale, timezone)}
        </p>
      ) : null}
      <MutationError error={mutation.error} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={mutation.isPending || task.status === "cancelled"}
          onClick={() =>
            mutation.mutate({
              taskId: task.id,
              status: done ? "inbox" : "done",
            })
          }
        >
          {mutation.isPending ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          ) : done ? (
            <Inbox />
          ) : (
            <Check />
          )}
          {done
            ? locale === "en"
              ? "Move back to inbox"
              : "Kembalikan ke inbox"
            : locale === "en"
              ? "Mark complete"
              : "Tandai selesai"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          role="link"
          render={
            <Link to="/calendar" search={{ mode: "tasks", id: task.id }} />
          }
        >
          {locale === "en" ? "View task" : "Lihat tugas"}
        </Button>
      </div>
    </>
  );
}

function ReminderDetails({ entity, locale, timezone }: DetailsProps) {
  const query = useQuery({ ...reminderQueryOptions(entity.id), retry: false });
  const deleteMutation = useDeleteReminder();
  const snoozeMutation = useSnoozeReminder();
  if (deleteMutation.isSuccess)
    return (
      <>
        <PopoverTitle className="break-words">{entity.title}</PopoverTitle>
        <p className="mt-3 text-sm text-ink-muted" role="status">
          {locale === "en" ? "Reminder deleted." : "Pengingat dihapus."}
        </p>
      </>
    );
  if (query.isPending)
    return <LoadingDetails entity={entity} locale={locale} />;
  if (query.isError)
    return (
      <DetailsError
        title={entity.title}
        error={query.error}
        onRetry={() => void query.refetch()}
        locale={locale}
      />
    );
  const reminder = query.data;
  const pending = deleteMutation.isPending || snoozeMutation.isPending;
  const recurrence = formatEntityRecurrence(reminder.recurrence, locale);

  return (
    <>
      <PopoverTitle className="break-words">{reminder.title}</PopoverTitle>
      <p className="mt-1 text-sm text-ink-muted">
        {when(reminder.scheduledAt, locale, timezone)}
      </p>
      {recurrence ? (
        <p className="mt-1 text-sm text-ink-muted">{recurrence}</p>
      ) : null}
      <MutationError error={deleteMutation.error ?? snoozeMutation.error} />
      <div className="mt-4 flex flex-wrap gap-2">
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              snoozeMutation.mutate({
                reminderId: reminder.id,
                until: new Date(
                  Math.max(
                    Date.now(),
                    new Date(reminder.scheduledAt).getTime()
                  ) + 3_600_000
                ).toISOString(),
              })
            }
          >
            {locale === "en" ? "Snooze 1 hour" : "Tunda 1 jam"}
          </Button>
        </>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                locale === "en"
                  ? `Delete reminder “${reminder.title}”? This cannot be undone.`
                  : `Hapus pengingat “${reminder.title}”? Tindakan ini tidak dapat dibatalkan.`
              )
            )
              deleteMutation.mutate(reminder.id);
          }}
        >
          {deleteMutation.isPending ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 />
          )}
          {locale === "en" ? "Delete" : "Hapus"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          role="link"
          render={<Link to="/reminders" />}
        >
          {locale === "en" ? "Manage reminder" : "Atur pengingat"}
        </Button>
      </div>
    </>
  );
}

function FileDetails({ entity, locale }: DetailsProps) {
  const query = useQuery({ ...documentQueryOptions(entity.id), retry: false });
  if (query.isPending)
    return <LoadingDetails entity={entity} locale={locale} />;
  if (query.isError)
    return (
      <DetailsError
        title={entity.title}
        error={query.error}
        onRetry={() => void query.refetch()}
        locale={locale}
      />
    );
  const document = query.data;
  const contentUrl = getDocumentContentUrl(document.id);

  return (
    <>
      <PopoverTitle className="break-words">{document.title}</PopoverTitle>
      <p className="mt-2 text-sm text-ink-muted">
        {document.file.mimeType} · {formatFileSize(document.file.size)}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {STATUS_LABELS[locale][document.status]}
      </p>
      {document.status === "failed" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {document.errorMessage ??
            (locale === "en"
              ? "File processing failed. Retry from Files."
              : "Pemrosesan file gagal. Coba ulangi dari File.")}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          nativeButton={false}
          role="link"
          render={
            <a href={contentUrl} target="_blank" rel="noreferrer noopener" />
          }
        >
          {locale === "en" ? "Open file" : "Buka file"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          role="link"
          render={<a href={`${contentUrl}?download=1`} />}
        >
          {locale === "en" ? "Download" : "Unduh"}
        </Button>
      </div>
    </>
  );
}

type EventMeetProps = {
  title: string;
  url?: string | null;
  status?: "pending" | "success" | "failure" | null;
  locale: SupportedLocale;
};

/** A Meet link is only ever a join action; conferencing state stays quiet text. */
export function EventMeetNote({
  url,
  status,
  locale,
}: Omit<EventMeetProps, "title">) {
  if (googleMeetJoinUrl(url)) return null;

  if (status === "pending")
    return (
      <p
        className="mt-1 flex items-center gap-2 text-sm text-ink-muted"
        role="status"
      >
        <LoaderCircle
          className="size-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {locale === "en" ? "Creating Meet link…" : "Link Meet sedang dibuat…"}
      </p>
    );

  if (status === "failure")
    return (
      <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
        <VideoOff className="size-3.5" aria-hidden="true" />
        {locale === "en"
          ? "Couldn't create Meet link"
          : "Link Meet gagal dibuat"}
      </p>
    );

  return null;
}

export function EventMeetJoinButton({ title, url, locale }: EventMeetProps) {
  const joinUrl = googleMeetJoinUrl(url);
  if (!joinUrl) return null;

  return (
    <Button
      size="sm"
      variant="secondary"
      nativeButton={false}
      role="link"
      aria-label={
        locale === "en"
          ? `Join Google Meet for ${title}`
          : `Gabung Google Meet untuk ${title}`
      }
      render={<a href={joinUrl} target="_blank" rel="noopener noreferrer" />}
    >
      <Video aria-hidden="true" />
      {locale === "en" ? "Join Google Meet" : "Gabung Google Meet"}
    </Button>
  );
}

function EventDetails({
  entity,
  locale,
  timezone,
}: DetailsProps & { entity: Extract<ChatEntity, { kind: "event" }> }) {
  // Refresh this event from its recorded range; a moved/deleted event is visibly unavailable.
  const query = useQuery({
    ...calendarEventsQueryOptions({
      from: entity.startAt ?? `${entity.allDayStartDate}T00:00:00.000Z`,
      to: entity.endAt ?? `${entity.allDayEndDate}T00:00:00.000Z`,
    }),
    retry: false,
  });

  if (query.isPending)
    return <LoadingDetails entity={entity} locale={locale} />;
  if (query.isError)
    return (
      <DetailsError
        title={entity.title}
        error={query.error}
        onRetry={() => void query.refetch()}
        locale={locale}
      />
    );
  const event = query.data.find((value) => value.id === entity.id);
  if (!event)
    return (
      <>
        <PopoverTitle className="break-words">{entity.title}</PopoverTitle>
        <p className="mt-2 text-sm text-ink-muted" role="status">
          {locale === "en"
            ? "This event is no longer in its original time range. Check Calendar for changes."
            : "Acara ini tidak lagi ada pada waktu semula. Periksa perubahan di Kalender."}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-3"
          nativeButton={false}
          role="link"
          render={<Link to="/calendar" />}
        >
          {locale === "en" ? "View calendar" : "Lihat kalender"}
        </Button>
      </>
    );

  // The refreshed event is authoritative; the snapshot only fills an older payload.
  const meetUrl = event.googleMeetUrl ?? entity.googleMeetUrl;

  return (
    <>
      <PopoverTitle className="break-words">{event.title}</PopoverTitle>
      <p className="mt-2 text-sm text-ink-muted">
        {STATUS_LABELS[locale][event.status]}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {event.allDayStartDate && event.allDayEndDate
          ? formatAllDayEventRange(
              event.allDayStartDate,
              event.allDayEndDate,
              locale
            )
          : event.startAt && event.endAt
            ? `${when(event.startAt, locale, event.timezone ?? timezone)} – ${when(event.endAt, locale, event.timezone ?? timezone)}`
            : locale === "en"
              ? "Time unavailable"
              : "Waktu tidak tersedia"}
      </p>
      {event.timezone ? (
        <p className="mt-1 text-sm text-ink-muted">{event.timezone}</p>
      ) : null}
      {event.location ? (
        <p className="mt-1 break-words text-sm text-ink-muted">
          {event.location}
        </p>
      ) : null}
      <EventMeetNote
        url={meetUrl}
        status={event.googleMeetStatus ?? entity.googleMeetStatus}
        locale={locale}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <EventMeetJoinButton
          title={event.title}
          url={meetUrl}
          locale={locale}
        />
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          role="link"
          render={
            <Link
              to="/calendar"
              search={{
                date:
                  event.allDayStartDate?.slice(0, 10) ??
                  (event.startAt
                    ? dayKeyInZone(
                        new Date(event.startAt),
                        event.timezone ?? timezone
                      )
                    : undefined),
                view: "day",
              }}
            />
          }
        >
          {locale === "en" ? "View calendar" : "Lihat kalender"}
        </Button>
      </div>
    </>
  );
}

export function EntityDetails(props: DetailsProps) {
  switch (props.entity.kind) {
    case "task":
      return <TaskDetails {...props} />;
    case "reminder":
      return <ReminderDetails {...props} />;
    case "file":
      return <FileDetails {...props} />;
    case "event":
      return <EventDetails {...props} entity={props.entity} />;
  }
}
