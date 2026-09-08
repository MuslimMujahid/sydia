import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Unplug,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/app-states";
import {
  clampDayKeyToMonth,
  dayKeyInZone,
  formatDayKeyLabel,
  formatMonthAnchor,
  getEventDayKeys,
  getMonthAnchorInZone,
  getMonthGridDays,
  getMonthGridRange,
  MonthGrid,
  shiftMonthAnchor,
  timeLabel,
  type MonthAnchor,
} from "@/components/calendar/month-grid";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/lib/hooks/forms";
import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "@/lib/services/api/calendar/calendar.api";
import { getGoogleCalendarAuthorizationUrl } from "@/lib/services/api/calendar/calendar.api";
import {
  calendarEventsQueryOptions,
  calendarStatusQueryOptions,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useDisconnectCalendar,
  useUpdateCalendarEvent,
} from "@/lib/services/api/calendar/calendar.queries";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils/date-time";

const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Masukkan judul minimal 2 karakter."),
    startAt: z.string().min(1, "Pilih waktu mulai."),
    endAt: z.string().min(1, "Pilih waktu selesai."),
    location: z.string(),
    description: z.string(),
    attendees: z.string(),
  })
  .refine(
    (value) =>
      !value.startAt ||
      !value.endAt ||
      new Date(value.endAt).getTime() > new Date(value.startAt).getTime(),
    { path: ["endAt"], message: "Waktu selesai harus setelah waktu mulai." }
  );

type EventEditorProps = {
  event?: CalendarEvent;
  /** Wall-time "yyyy-MM-ddTHH:mm" prefill in the page time zone. */
  initialStartAt?: string;
  initialEndAt?: string;
  timezone: string;
  onClose: () => void;
};

function EventEditor({
  event,
  initialStartAt,
  initialEndAt,
  timezone,
  onClose,
}: EventEditorProps) {
  const createMutation = useCreateCalendarEvent();
  const updateMutation = useUpdateCalendarEvent();
  const deleteMutation = useDeleteCalendarEvent();
  const mutation = event ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: {
      title: event?.title ?? "",
      startAt: event ? toDateTimeLocal(event.startAt) : (initialStartAt ?? ""),
      endAt: event ? toDateTimeLocal(event.endAt) : (initialEndAt ?? ""),
      location: event?.location ?? "",
      description: event?.description ?? "",
      attendees: event?.attendees.join(", ") ?? "",
    },
    validators: { onChange: eventSchema },
    onSubmit: async ({ value }) => {
      const startAt = fromDateTimeLocal(value.startAt);
      const endAt = fromDateTimeLocal(value.endAt);
      if (!startAt || !endAt) return;
      const values: CalendarEventWriteInput = {
        title: value.title.trim(),
        startAt,
        endAt,
        timezone,
        location: value.location.trim() || null,
        description: value.description.trim() || null,
        attendees: [
          ...new Set(
            value.attendees
              .split(",")
              .map((attendee) => attendee.trim())
              .filter(Boolean)
          ),
        ],
      };

      if (event)
        await updateMutation.mutateAsync({ eventId: event.id, values });
      else await createMutation.mutateAsync(values);
      onClose();
    },
  });

  async function handleCancel() {
    if (!event || !window.confirm(`Batalkan acara “${event.title}”?`)) return;
    await deleteMutation.mutateAsync(event.id);
    onClose();
  }

  return (
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
      <DialogTitle>{event ? "Edit acara" : "Acara baru"}</DialogTitle>
      <DialogDescription className="mt-2">
        {event
          ? "Perbarui rincian acara dan sinkronkan perubahan."
          : "Tambahkan waktu yang perlu Anda lihat dalam agenda."}
      </DialogDescription>
      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          mutation.reset();
          void form.handleSubmit();
        }}
      >
        <form.Field name="title">
          {(field) => (
            <FieldShell
              id="event-title"
              label="Judul"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="event-title"
                  autoFocus
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(inputEvent) =>
                    field.handleChange(inputEvent.target.value)
                  }
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="startAt">
            {(field) => (
              <FieldShell
                id="event-start"
                label="Mulai"
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <TextField
                    id="event-start"
                    type="datetime-local"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    onBlur={field.handleBlur}
                    onChange={(inputEvent) =>
                      field.handleChange(inputEvent.target.value)
                    }
                  />
                )}
              </FieldShell>
            )}
          </form.Field>
          <form.Field name="endAt">
            {(field) => (
              <FieldShell
                id="event-end"
                label="Selesai"
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <TextField
                    id="event-end"
                    type="datetime-local"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    onBlur={field.handleBlur}
                    onChange={(inputEvent) =>
                      field.handleChange(inputEvent.target.value)
                    }
                  />
                )}
              </FieldShell>
            )}
          </form.Field>
        </div>
        <form.Field name="location">
          {(field) => (
            <FieldShell id="event-location" label="Lokasi">
              {() => (
                <TextField
                  id="event-location"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(inputEvent) =>
                    field.handleChange(inputEvent.target.value)
                  }
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="attendees">
          {(field) => (
            <FieldShell
              id="event-attendees"
              label="Peserta"
              description="Pisahkan beberapa alamat email dengan koma."
            >
              {() => (
                <TextField
                  id="event-attendees"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(inputEvent) =>
                    field.handleChange(inputEvent.target.value)
                  }
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <FieldShell id="event-description" label="Catatan">
              {() => (
                <Textarea
                  id="event-description"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(inputEvent) =>
                    field.handleChange(inputEvent.target.value)
                  }
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <p className="text-sm text-ink-muted">
          Zona waktu: {timezone.replaceAll("_", " ")}
        </p>
        <FormError
          message={mutation.error?.message ?? deleteMutation.error?.message}
        />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-between">
          {event ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void handleCancel()}
            >
              {deleteMutation.isPending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {deleteMutation.isPending ? "Membatalkan…" : "Batalkan acara"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3 sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isSubmitting ? "Menyimpan…" : "Simpan acara"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

function AgendaEventRow({
  event,
  onEdit,
}: {
  event: CalendarEvent;
  onEdit: () => void;
}) {
  return (
    <li className="grid gap-3 py-5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-start">
      <time
        dateTime={event.startAt}
        className="font-mono text-sm font-medium text-ink-soft"
      >
        {timeLabel(event)}
      </time>
      <button
        type="button"
        className="min-w-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
        onClick={onEdit}
      >
        <span className="block font-display text-base font-semibold">
          {event.title}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
          {event.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              {event.location}
            </span>
          ) : null}
          {event.attendees.length ? (
            <span className="flex items-center gap-1.5">
              <UsersRound className="size-4" />
              {event.attendees.length} peserta
            </span>
          ) : null}
          <span>
            {event.provider === "google" ? "Google Calendar" : "Sydia"}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Tindakan untuk ${event.title}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> Edit acara
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function CalendarPage({ timezone }: { timezone: string }) {
  const [editingEvent, setEditingEvent] = useState<
    CalendarEvent | "new" | null
  >(null);

  const [draftTimes, setDraftTimes] = useState<{
    startAt: string;
    endAt: string;
  } | null>(null);

  const [monthAnchor, setMonthAnchor] = useState<MonthAnchor>(() =>
    getMonthAnchorInZone(timezone)
  );

  const [selectedDay, setSelectedDay] = useState<string>(() =>
    dayKeyInZone(new Date(), timezone)
  );

  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const range = useMemo(
    () => getMonthGridRange(monthAnchor, timezone),
    [monthAnchor, timezone]
  );

  const statusQuery = useQuery(calendarStatusQueryOptions());
  const eventsQuery = useQuery({
    ...calendarEventsQueryOptions(range),
    placeholderData: (previous) => previous,
  });

  const disconnectMutation = useDisconnectCalendar();
  const activeEvents = useMemo(
    () =>
      (eventsQuery.data ?? []).filter((event) => event.status !== "cancelled"),
    [eventsQuery.data]
  );

  const gridDays = useMemo(() => getMonthGridDays(monthAnchor), [monthAnchor]);
  const eventsByDay = useMemo(() => {
    const visibleDays = new Set(gridDays.map((day) => day.key));
    const groups: Record<string, CalendarEvent[]> = {};

    for (const event of activeEvents)
      for (const key of getEventDayKeys(event)) {
        if (!visibleDays.has(key)) continue;
        groups[key] = [...(groups[key] ?? []), event];
      }

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      if (group)
        group.sort((left, right) => left.startAt.localeCompare(right.startAt));
    }

    return groups;
  }, [activeEvents, gridDays]);

  const hasVisibleEvents = Object.keys(eventsByDay).length > 0;
  const selectedEvents = eventsByDay[selectedDay] ?? [];

  function changeMonth(delta: number) {
    const next = shiftMonthAnchor(monthAnchor, delta);
    setMonthAnchor(next);
    setSelectedDay((current) => clampDayKeyToMonth(current, next));
  }

  function goToday() {
    const now = new Date();
    setMonthAnchor(getMonthAnchorInZone(timezone, now));
    setSelectedDay(dayKeyInZone(now, timezone));
  }

  function openCreate(prefill?: { startAt: string; endAt: string }) {
    setDraftTimes(prefill ?? null);
    setEditingEvent("new");
  }

  function handleCreateForDay(dayKey: string) {
    openCreate({ startAt: `${dayKey}T09:00`, endAt: `${dayKey}T10:00` });
  }

  function closeEditor() {
    setEditingEvent(null);
    setDraftTimes(null);
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "Putuskan Google Calendar? Acara lokal di Sydia tetap tersimpan."
      )
    )
      return;
    await disconnectMutation.mutateAsync();
  }

  async function handleConnect() {
    setConnectError(null);
    setIsConnecting(true);

    try {
      window.location.assign(await getGoogleCalendarAuthorizationUrl());
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Koneksi Google Calendar tidak dapat dimulai."
      );
      setIsConnecting(false);
    }
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Kalender"
        description="Telusuri kalender per bulan dan kelola waktu tanpa meninggalkan Sydia."
        action={
          <Button onClick={() => openCreate()}>
            <Plus /> Buat acara
          </Button>
        }
      />
      <section
        aria-labelledby="calendar-connection-title"
        className="flex flex-col gap-4 border-y border-surface-1 py-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2
            id="calendar-connection-title"
            className="flex items-center gap-2 font-display text-[17px] font-semibold"
          >
            <CalendarDays className="size-5 text-brand-deep" /> Google Calendar
          </h2>
          {statusQuery.isPending ? (
            <p className="mt-1 text-sm text-ink-muted" role="status">
              Memeriksa koneksi…
            </p>
          ) : null}
          {statusQuery.isError ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {statusQuery.error.message}
            </p>
          ) : null}
          {statusQuery.data ? (
            <p className="mt-1 text-sm text-ink-muted">
              {statusQuery.data.connected
                ? `Terhubung${statusQuery.data.calendarId ? ` ke ${statusQuery.data.calendarId}` : ""}. Perubahan akan disinkronkan.`
                : "Belum terhubung. Anda masih dapat memakai agenda lokal."}
            </p>
          ) : null}
        </div>
        {statusQuery.data?.connected ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="secondary"
                  aria-label="Kelola koneksi kalender"
                />
              }
            >
              <Badge dot="brand">Terhubung</Badge>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                destructive
                disabled={disconnectMutation.isPending}
                onClick={() => void handleDisconnect()}
              >
                <Unplug />{" "}
                {disconnectMutation.isPending
                  ? "Memutuskan…"
                  : "Putuskan kalender"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            disabled={statusQuery.data?.available === false || isConnecting}
            onClick={() => void handleConnect()}
          >
            {isConnecting ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ExternalLink />
            )}{" "}
            {isConnecting ? "Menghubungkan…" : "Hubungkan Google"}
          </Button>
        )}
        {statusQuery.data?.available === false ? (
          <p className="text-sm text-ink-muted">
            Integrasi Google belum tersedia.
          </p>
        ) : null}
        {disconnectMutation.error || connectError ? (
          <p className="text-sm text-destructive" role="alert">
            {disconnectMutation.error?.message ?? connectError}
          </p>
        ) : null}
      </section>
      {eventsQuery.isPending ? (
        <DomainListSkeleton label="Memuat kalender" />
      ) : null}
      {eventsQuery.isError ? (
        <DomainInlineError
          title="Kalender tidak dapat dimuat"
          message={eventsQuery.error.message}
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : null}
      {eventsQuery.isSuccess ? (
        <section aria-labelledby="calendar-month-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="calendar-month-title"
              aria-live="polite"
              className="font-display text-xl font-semibold capitalize"
            >
              {formatMonthAnchor(monthAnchor)}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Bulan sebelumnya"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button variant="dark-outline" size="sm" onClick={goToday}>
                Hari ini
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Bulan berikutnya"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <MonthGrid
            anchor={monthAnchor}
            timeZone={timezone}
            eventsByDay={eventsByDay}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onEditEvent={setEditingEvent}
            onCreateForDay={handleCreateForDay}
          />
        </section>
      ) : null}
      {eventsQuery.isSuccess && !hasVisibleEvents ? (
        <EmptyState
          title={`Belum ada acara di ${formatMonthAnchor(monthAnchor)}`}
          message="Buat acara atau hubungkan Google Calendar agar komitmen waktu terlihat di sini."
        />
      ) : null}
      {eventsQuery.isSuccess && hasVisibleEvents ? (
        <section aria-labelledby="calendar-selected-day-title">
          <div className="flex items-center gap-3 border-b border-surface-1 pb-3">
            <Clock3 className="size-5 text-brand-deep" />
            <h2
              id="calendar-selected-day-title"
              className="font-display text-[17px] font-semibold capitalize"
            >
              {formatDayKeyLabel(selectedDay)}
            </h2>
          </div>
          {selectedEvents.length ? (
            <ul className="divide-y divide-surface-1">
              {selectedEvents.map((event) => (
                <AgendaEventRow
                  key={event.id}
                  event={event}
                  onEdit={() => setEditingEvent(event)}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 py-5">
              <p className="text-sm text-ink-muted">
                Tidak ada acara pada hari ini.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCreateForDay(selectedDay)}
              >
                <Plus /> Buat acara
              </Button>
            </div>
          )}
        </section>
      ) : null}
      <Dialog
        open={Boolean(editingEvent)}
        onOpenChange={(open) => !open && closeEditor()}
      >
        {editingEvent ? (
          <EventEditor
            key={
              editingEvent === "new"
                ? `new-${draftTimes?.startAt ?? "blank"}`
                : editingEvent.id
            }
            event={editingEvent === "new" ? undefined : editingEvent}
            initialStartAt={draftTimes?.startAt}
            initialEndAt={draftTimes?.endAt}
            timezone={timezone}
            onClose={closeEditor}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
