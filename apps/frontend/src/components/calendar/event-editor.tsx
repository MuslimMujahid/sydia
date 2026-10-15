import {
  CalendarDays,
  Bell,
  Clock3,
  LoaderCircle,
  MapPin,
  AlignLeft,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { DateTimeField } from "@/components/forms/date-time-field";
import {
  FieldShell,
  fieldErrorMessages,
  FormError,
  TextField,
  SelectField,
} from "@/components/forms/form-fields";
import { TimePicker } from "@/components/forms/time-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EventNotesEditor, eventNotesSummary } from "./event-notes";
import { useAppForm } from "@/lib/hooks/forms";
import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "@/lib/services/api/calendar/calendar.api";
import {
  useCopyCalendarEvent,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useExportCalendarEvent,
  useRetryCalendarEventSync,
  useUpdateCalendarEvent,
} from "@/lib/services/api/calendar/calendar.queries";
import { splitDateTimeLocal } from "@/lib/utils/date-time";
import { addDays } from "./calendar-date";
import { changedEventValues } from "./calendar-event-write";
import { eventTimeInZone, eventTimeToIso } from "./event-time";
import { EventEditorRow } from "./event-editor-row";
import { EventRecurrenceField } from "./event-recurrence-field";
import { REPEAT_LABELS, recurrencePreset } from "./event-recurrence";
import { formatShortDayKey } from "@/lib/utils/date-time";

const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Masukkan judul minimal 2 karakter."),
    isAllDay: z.boolean(),
    startAt: z.string(),
    endAt: z.string(),
    allDayStartDate: z.string(),
    allDayEndDate: z.string(),
    location: z.string(),
    description: z.string(),
    attendees: z.string().refine(
      (value) =>
        value
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean)
          .every((email) => z.email().safeParse(email).success),
      "Masukkan alamat email peserta yang valid."
    ),
    recurrence: z.array(z.string()),
    reminderMinutes: z.enum(["10", "15", "30", "60"]),
  })
  .superRefine((value, context) => {
    if (value.isAllDay) {
      if (!value.allDayStartDate)
        context.addIssue({
          code: "custom",
          path: ["allDayStartDate"],
          message: "Pilih tanggal mulai.",
        });
      if (!value.allDayEndDate)
        context.addIssue({
          code: "custom",
          path: ["allDayEndDate"],
          message: "Pilih tanggal selesai.",
        });
      if (
        value.allDayStartDate &&
        value.allDayEndDate &&
        value.allDayEndDate < value.allDayStartDate
      )
        context.addIssue({
          code: "custom",
          path: ["allDayEndDate"],
          message: "Tanggal selesai harus sama atau setelah tanggal mulai.",
        });

      return;
    }

    if (!value.startAt)
      context.addIssue({
        code: "custom",
        path: ["startAt"],
        message: "Pilih waktu mulai.",
      });
    if (!value.endAt)
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Pilih waktu selesai.",
      });
    if (
      value.startAt &&
      value.endAt &&
      new Date(value.endAt).getTime() <= new Date(value.startAt).getTime()
    )
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Waktu selesai harus setelah waktu mulai.",
      });
  });

const EVENT_TIME_FIELDS = [
  { name: "startAt", id: "event-start", label: "Mulai" },
  { name: "endAt", id: "event-end", label: "Selesai" },
] as const;

/** "yyyy-MM-ddTHH:mm" from its parts; empty while the date is missing. */
function joinDateTimeLocal(date: string, time: string): string {
  return date ? `${date}T${time}` : "";
}

export type EventEditorProps = {
  event?: CalendarEvent;
  googleConnected?: boolean;
  /** Wall-time "yyyy-MM-ddTHH:mm" prefill in the page time zone. */
  initialStartAt?: string;
  initialEndAt?: string;
  timezone: string;
  /** Content above the title, such as the event/task switch. */
  header?: ReactNode;
  onClose: () => void;
};

export function EventEditor({
  event,
  googleConnected = false,
  initialStartAt,
  initialEndAt,
  timezone,
  header,
  onClose,
}: EventEditorProps) {
  const eventTimezone = event?.timezone ?? timezone;
  const [destination, setDestination] = useState<"google" | "local">(
    googleConnected ? "google" : "local"
  );

  const [expanded, setExpanded] = useState({
    time: false,
    attendees: false,
    reminder: false,
    location: false,
    description: false,
    meet: false,
  });

  const [createGoogleMeet, setCreateGoogleMeet] = useState<boolean | undefined>(
    undefined
  );

  const [recurrenceValid, setRecurrenceValid] = useState(true);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const googleActive = event
    ? event.provider === "google"
    : googleConnected && destination === "google";

  function toggleRow(row: keyof typeof expanded) {
    setExpanded((current) => ({ ...current, [row]: !current[row] }));
  }

  const destinationTouched = useRef(false);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(
    null
  );

  const createMutation = useCreateCalendarEvent();
  const copyMutation = useCopyCalendarEvent();
  const exportMutation = useExportCalendarEvent();
  const updateMutation = useUpdateCalendarEvent();
  const retrySyncMutation = useRetryCalendarEventSync();
  const deleteMutation = useDeleteCalendarEvent();
  const mutation = event ? updateMutation : createMutation;

  useEffect(() => {
    if (!event && googleConnected && !destinationTouched.current)
      setDestination("google");
  }, [event, googleConnected]);

  function idempotencyKey(action: string, value: unknown): string {
    const fingerprint = JSON.stringify({ action, value });
    if (idempotencyRef.current?.fingerprint !== fingerprint)
      idempotencyRef.current = { fingerprint, key: crypto.randomUUID() };

    return idempotencyRef.current.key;
  }

  function clearIdempotencyKey(key: string): void {
    if (idempotencyRef.current?.key === key) idempotencyRef.current = null;
  }

  const form = useAppForm({
    defaultValues: {
      title: event?.title ?? "",
      isAllDay: Boolean(event?.allDayStartDate && event.allDayEndDate),
      startAt: event?.startAt
        ? eventTimeInZone(event.startAt, eventTimezone)
        : (initialStartAt ?? ""),
      endAt: event?.endAt
        ? eventTimeInZone(event.endAt, eventTimezone)
        : (initialEndAt ?? ""),
      allDayStartDate:
        event?.allDayStartDate?.slice(0, 10) ??
        initialStartAt?.slice(0, 10) ??
        "",
      allDayEndDate: event?.allDayEndDate
        ? addDays(event.allDayEndDate.slice(0, 10), -1)
        : (initialEndAt?.slice(0, 10) ?? initialStartAt?.slice(0, 10) ?? ""),
      location: event?.location ?? "",
      description: event?.description ?? "",
      attendees: event?.attendees.join(", ") ?? "",
      recurrence: event?.recurrence ?? [],
      reminderMinutes: String(event?.reminderMinutes ?? 10) as
        "10" | "15" | "30" | "60",
    },
    validators: { onChange: eventSchema },
    onSubmit: async ({ value }) => {
      const common = {
        title: value.title.trim(),
        reminderMinutes: Number(value.reminderMinutes),
        recurrence: value.recurrence,
        ...(googleActive && createGoogleMeet !== undefined
          ? { createGoogleMeet }
          : {}),
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

      let values: CalendarEventWriteInput;

      if (value.isAllDay) {
        if (!value.allDayStartDate || !value.allDayEndDate) return;
        values = {
          ...common,
          allDayStartDate: value.allDayStartDate,
          allDayEndDate: addDays(value.allDayEndDate, 1),
        };
      } else {
        const startAt = eventTimeToIso(value.startAt, eventTimezone);
        const endAt = eventTimeToIso(value.endAt, eventTimezone);
        if (!startAt || !endAt) return;
        values = { ...common, startAt, endAt, timezone: eventTimezone };
      }

      const writeValues = event ? changedEventValues(event, values) : values;

      if (event && Object.keys(writeValues).length === 0) {
        onClose();

        return;
      }

      const key = idempotencyKey(event ? "update" : "create", {
        eventId: event?.id ?? null,
        values: writeValues,
        destination: event ? null : destination,
      });

      if (event)
        await updateMutation.mutateAsync({
          eventId: event.id,
          values: writeValues,
          idempotencyKey: key,
        });
      else
        await createMutation.mutateAsync({
          values,
          idempotencyKey: key,
          destination,
        });
      clearIdempotencyKey(key);
      onClose();
    },
  });

  async function handleCancel() {
    if (!event || !window.confirm(`Batalkan acara “${event.title}”?`)) return;
    const key = idempotencyKey("cancel", { eventId: event.id });
    await deleteMutation.mutateAsync({
      eventId: event.id,
      idempotencyKey: key,
    });
    clearIdempotencyKey(key);
    onClose();
  }

  async function handleCopyToSydia() {
    if (!event || event.isOccurrence) return;
    const key = idempotencyKey("copy", { eventId: event.id });
    await copyMutation.mutateAsync({ eventId: event.id, idempotencyKey: key });
    clearIdempotencyKey(key);
    onClose();
  }

  async function handleExportToGoogle() {
    if (!event) return;
    const key = idempotencyKey("export", { eventId: event.id });
    await exportMutation.mutateAsync({
      eventId: event.id,
      idempotencyKey: key,
    });
    clearIdempotencyKey(key);
    onClose();
  }

  async function handleRetrySync() {
    if (!event || event.provider !== "google" || event.syncState !== "error")
      return;
    await retrySyncMutation.mutateAsync(event.id);
    onClose();
  }

  const isReadOnlyGoogleEvent =
    event?.provider === "google" && event.syncState === "reconnect_required";

  if (isReadOnlyGoogleEvent && event)
    return (
      <DialogContent
        variant="sheet"
        className="sm:max-h-[90dvh] sm:max-w-2xl sm:overflow-y-auto"
      >
        {header}
        <DialogTitle>Acara Google Calendar</DialogTitle>
        <DialogDescription className="mt-2">
          Acara ini hanya-baca karena kalender Google sumbernya tidak sedang
          tersinkron. Menyalinnya membuat acara terpisah yang dapat Anda edit di
          Sydia.
        </DialogDescription>
        <p className="mt-5 rounded-sm bg-surface-1 px-4 py-3 font-medium text-ink">
          {event.title}
        </p>
        <FormError message={copyMutation.error?.message} />
        <div className="mt-6 flex justify-end gap-3 border-t border-surface-1 pt-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          {event.isOccurrence ? (
            <p className="self-center text-sm text-ink-muted">
              Pilih kembali kalender Google sumber untuk menyalin kejadian
              berulang ini.
            </p>
          ) : (
            <Button
              type="button"
              disabled={copyMutation.isPending}
              onClick={() => void handleCopyToSydia()}
            >
              {copyMutation.isPending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {copyMutation.isPending ? "Menyalin…" : "Salin ke Sydia"}
            </Button>
          )}
        </div>
      </DialogContent>
    );

  return (
    <DialogContent
      variant="sheet"
      className="flex flex-col overflow-hidden sm:max-h-[90dvh] sm:max-w-lg"
    >
      {header}
      <DialogTitle className="sr-only">
        {event ? "Edit acara" : "Acara baru"}
      </DialogTitle>
      <DialogDescription className="sr-only">
        Isi judul dan waktu acara, lalu tambahkan detail yang diperlukan.
      </DialogDescription>
      <form
        className="flex min-h-0 flex-1 flex-col pt-5"
        noValidate
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          mutation.reset();
          setSubmitError(undefined);
          if (!form.state.isValid)
            setExpanded((current) => ({
              ...current,
              time: true,
              attendees: true,
            }));
          void form.handleSubmit().catch((error: unknown) => {
            console.error("Calendar event submission failed", error);
            setSubmitError(
              error instanceof Error
                ? error.message
                : "Acara tidak dapat disimpan. Coba lagi."
            );
          });
        }}
      >
        <div className="mb-4 shrink-0 pl-10.5 pr-6">
          <form.Field name="title">
            {(field) => (
              <>
                <TextField
                  id="event-title"
                  aria-label="Judul"
                  autoFocus
                  placeholder="Tambahkan judul"
                  className="h-12 rounded-none border-0 border-b border-ink/16 bg-transparent px-0 font-display text-2xl shadow-none focus-visible:ring-0"
                  value={field.state.value}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={
                    field.state.meta.errors.length
                      ? "event-title-error"
                      : undefined
                  }
                  onBlur={field.handleBlur}
                  onChange={(inputEvent) =>
                    field.handleChange(inputEvent.target.value)
                  }
                />
                {field.state.meta.errors.length ? (
                  <p
                    id="event-title-error"
                    role="alert"
                    className="mt-1 text-xs text-destructive"
                  >
                    Masukkan judul minimal 2 karakter.
                  </p>
                ) : null}
              </>
            )}
          </form.Field>
        </div>
        <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const start = values.isAllDay
                ? values.allDayStartDate
                : values.startAt.slice(0, 10);

              const end = values.isAllDay
                ? values.allDayEndDate
                : values.endAt.slice(0, 10);

              const date = start
                ? formatShortDayKey(start)
                : "Pilih tanggal dan waktu";

              const endDate =
                end && end !== start ? ` – ${formatShortDayKey(end)}` : "";

              const time = values.isAllDay
                ? " · Sepanjang hari"
                : values.startAt && values.endAt
                  ? ` · ${values.startAt.slice(11)}–${values.endAt.slice(11)}`
                  : "";

              return (
                <EventEditorRow
                  icon={Clock3}
                  label="Ubah tanggal dan waktu"
                  summary={`${date}${endDate}${time}`}
                  detail={`${eventTimezone.replaceAll("_", " ")} · ${REPEAT_LABELS[recurrencePreset(values.recurrence)]}`}
                  open={expanded.time}
                  onToggle={() => toggleRow("time")}
                >
                  {values.isAllDay ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          {
                            name: "allDayStartDate",
                            id: "event-start-date",
                            label: "Mulai",
                          },
                          {
                            name: "allDayEndDate",
                            id: "event-end-date",
                            label: "Selesai",
                          },
                        ] as const
                      ).map(({ name, id, label }) => (
                        <form.Field key={name} name={name}>
                          {(field) => (
                            <FieldShell
                              id={id}
                              label={label}
                              errors={field.state.meta.errors}
                            >
                              {({ describedBy, invalid }) => (
                                <TextField
                                  id={id}
                                  type="date"
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
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto_4.5rem] items-start gap-1.5">
                      <DateTimeField
                        id="event"
                        label="Acara"
                        date={values.startAt.slice(0, 10)}
                        time={values.startAt.slice(11)}
                        dateOnly
                        hideLabel
                        onDateChange={(nextDate) => {
                          form.setFieldValue(
                            "startAt",
                            joinDateTimeLocal(
                              nextDate,
                              values.startAt.slice(11) || "09:00"
                            )
                          );
                          form.setFieldValue(
                            "endAt",
                            joinDateTimeLocal(
                              nextDate,
                              values.endAt.slice(11) || "10:00"
                            )
                          );
                        }}
                        onTimeChange={(nextTime) =>
                          form.setFieldValue(
                            "startAt",
                            joinDateTimeLocal(
                              values.startAt.slice(0, 10),
                              nextTime
                            )
                          )
                        }
                      />
                      {EVENT_TIME_FIELDS.map(({ name, id, label }) => (
                        <form.Field key={name} name={name}>
                          {(field) => {
                            const { date: fieldDate, time: fieldTime } =
                              splitDateTimeLocal(field.state.value);

                            const messages = fieldErrorMessages(
                              field.state.meta.errors
                            );

                            const errorId = messages.length
                              ? `${id}-error`
                              : undefined;

                            return (
                              <>
                                {name === "endAt" ? (
                                  <span
                                    className="flex h-11 items-center text-ink-muted"
                                    aria-hidden="true"
                                  >
                                    –
                                  </span>
                                ) : null}
                                <div className="min-w-0">
                                  <TimePicker
                                    id={`${id}-time`}
                                    label={`Jam ${label.toLowerCase()}`}
                                    value={fieldTime}
                                    compact
                                    disabled={!values.startAt}
                                    invalid={messages.length > 0}
                                    describedBy={errorId}
                                    onChange={(nextTime) =>
                                      field.handleChange(
                                        joinDateTimeLocal(fieldDate, nextTime)
                                      )
                                    }
                                    onBlur={field.handleBlur}
                                  />
                                  {messages.length ? (
                                    <p
                                      id={errorId}
                                      role="alert"
                                      className="mt-1 text-xs text-destructive"
                                    >
                                      {messages.join(" ")}
                                    </p>
                                  ) : null}
                                </div>
                              </>
                            );
                          }}
                        </form.Field>
                      ))}
                    </div>
                  )}
                  <form.Field name="isAllDay">
                    {(field) => (
                      <label className="flex min-h-9 items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.state.value}
                          disabled={Boolean(event)}
                          onCheckedChange={(checked) => {
                            field.handleChange(checked === true);

                            if (checked) {
                              form.setFieldValue(
                                "allDayStartDate",
                                values.startAt.slice(0, 10)
                              );
                              form.setFieldValue(
                                "allDayEndDate",
                                values.endAt.slice(0, 10)
                              );
                            } else {
                              form.setFieldValue(
                                "startAt",
                                joinDateTimeLocal(
                                  values.allDayStartDate,
                                  values.startAt.slice(11) || "09:00"
                                )
                              );
                              form.setFieldValue(
                                "endAt",
                                joinDateTimeLocal(
                                  values.allDayStartDate,
                                  values.endAt.slice(11) || "10:00"
                                )
                              );
                            }
                          }}
                        />{" "}
                        Sepanjang hari
                      </label>
                    )}
                  </form.Field>
                  {event ? (
                    <p className="text-xs text-ink-muted">
                      Jenis waktu acara yang tersimpan tidak dapat diubah.
                    </p>
                  ) : null}
                  <form.Field name="recurrence">
                    {(field) => (
                      <EventRecurrenceField
                        value={field.state.value}
                        startDate={start}
                        allDay={values.isAllDay}
                        timezone={eventTimezone}
                        disabled={Boolean(
                          event?.recurringParentEventId ||
                          event?.recurringParentProviderEventId
                        )}
                        onChange={field.handleChange}
                        onValidityChange={setRecurrenceValid}
                      />
                    )}
                  </form.Field>
                  {event?.recurringParentEventId ||
                  event?.recurringParentProviderEventId ? (
                    <p className="text-xs text-ink-muted">
                      Ubah seluruh rangkaian untuk mengganti pengulangan.
                    </p>
                  ) : null}
                </EventEditorRow>
              );
            }}
          </form.Subscribe>
          <form.Field name="reminderMinutes">
            {(field) => (
              <EventEditorRow
                icon={Bell}
                label="Ubah pengingat"
                summary={
                  field.state.value === "60"
                    ? "1 jam sebelum acara"
                    : `${field.state.value} menit sebelum acara`
                }
                open={expanded.reminder}
                onToggle={() => toggleRow("reminder")}
              >
                <FieldShell
                  id="event-reminder"
                  label="Pengingat sebelum acara"
                  errors={field.state.meta.errors}
                >
                  {({ describedBy, invalid }) => (
                    <SelectField
                      id="event-reminder"
                      value={field.state.value}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      onBlur={field.handleBlur}
                      onChange={(change) =>
                        field.handleChange(
                          change.target.value as "10" | "15" | "30" | "60"
                        )
                      }
                    >
                      <option value="10">10 menit sebelumnya</option>
                      <option value="15">15 menit sebelumnya</option>
                      <option value="30">30 menit sebelumnya</option>
                      <option value="60">1 jam sebelumnya</option>
                    </SelectField>
                  )}
                </FieldShell>
              </EventEditorRow>
            )}
          </form.Field>
          <form.Field name="attendees">
            {(field) => (
              <EventEditorRow
                icon={Users}
                label="Ubah peserta"
                summary={field.state.value || "Tambahkan peserta"}
                open={expanded.attendees}
                onToggle={() => toggleRow("attendees")}
              >
                <FieldShell
                  id="event-attendees"
                  label="Peserta"
                  description="Pisahkan alamat email dengan koma."
                  errors={field.state.meta.errors}
                >
                  {({ describedBy, invalid }) => (
                    <TextField
                      id="event-attendees"
                      value={field.state.value}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      placeholder="nama@email.com"
                      onBlur={field.handleBlur}
                      onChange={(inputEvent) =>
                        field.handleChange(inputEvent.target.value)
                      }
                    />
                  )}
                </FieldShell>
              </EventEditorRow>
            )}
          </form.Field>
          <form.Field name="location">
            {(field) => (
              <EventEditorRow
                icon={MapPin}
                label="Ubah lokasi"
                summary={field.state.value || "Tambahkan lokasi"}
                open={expanded.location}
                onToggle={() => toggleRow("location")}
              >
                <TextField
                  id="event-location"
                  aria-label="Lokasi"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(inputEvent) =>
                    field.handleChange(inputEvent.target.value)
                  }
                />
              </EventEditorRow>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <EventEditorRow
                icon={AlignLeft}
                label="Ubah catatan"
                summary={
                  eventNotesSummary(field.state.value) || "Tambahkan catatan"
                }
                open={expanded.description}
                onToggle={() => toggleRow("description")}
              >
                <EventNotesEditor
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
              </EventEditorRow>
            )}
          </form.Field>
          <div className="flex min-h-11 items-center gap-4 px-2 py-2.5 text-sm">
            <CalendarDays
              className="size-4.5 shrink-0 text-ink-muted"
              aria-hidden="true"
            />
            <div className="min-w-0">
              {!event ? (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={googleConnected && destination === "google"}
                    disabled={!googleConnected}
                    onCheckedChange={(checked) => {
                      destinationTouched.current = true;
                      setDestination(checked === true ? "google" : "local");
                    }}
                  />
                  Buat kalender Google
                </label>
              ) : (
                <span>
                  {event.provider === "google"
                    ? "Google Calendar"
                    : "Kalender Sydia"}
                </span>
              )}
              {!event && !googleConnected ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Hubungkan Google Calendar di Pengaturan untuk mengaktifkan.
                </p>
              ) : null}
            </div>
          </div>
          {googleActive ? (
            <EventEditorRow
              icon={Video}
              label="Ubah Google Meet"
              summary={
                event?.googleMeetUrl && createGoogleMeet !== false
                  ? "Google Meet"
                  : createGoogleMeet || event?.googleMeetStatus === "pending"
                    ? "Google Meet akan dibuat"
                    : "Tambahkan konferensi video Google Meet"
              }
              open={expanded.meet}
              onToggle={() => toggleRow("meet")}
            >
              {event?.googleMeetUrl && createGoogleMeet !== false ? (
                <a
                  href={event.googleMeetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-sm underline underline-offset-4"
                >
                  {event.googleMeetUrl}
                </a>
              ) : null}
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={
                    createGoogleMeet ??
                    Boolean(
                      event?.googleMeetUrl ||
                      event?.googleMeetStatus === "pending"
                    )
                  }
                  onCheckedChange={(checked) =>
                    setCreateGoogleMeet(checked === true)
                  }
                />
                Tambahkan Google Meet
              </label>
              {!event?.googleMeetUrl || createGoogleMeet === false ? (
                <p className="text-xs text-ink-muted">
                  Tautan tersedia setelah acara disimpan dan disinkronkan.
                </p>
              ) : null}
              {event?.googleMeetStatus === "failure" ? (
                <p role="alert" className="text-xs text-destructive">
                  Google Meet gagal dibuat. Aktifkan kembali lalu simpan untuk
                  mencoba lagi.
                </p>
              ) : null}
            </EventEditorRow>
          ) : null}
        </div>
        <FormError
          message={
            submitError ??
            mutation.error?.message ??
            retrySyncMutation.error?.message ??
            deleteMutation.error?.message ??
            exportMutation.error?.message
          }
        />
        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-surface-1 pt-4">
          <div className="flex flex-wrap gap-2">
            {event?.provider === "google" && event.syncState === "error" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={retrySyncMutation.isPending}
                onClick={() => void handleRetrySync()}
              >
                {retrySyncMutation.isPending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {retrySyncMutation.isPending
                  ? "Menjadwalkan…"
                  : "Coba sinkronkan lagi"}
              </Button>
            ) : null}
            {event?.provider === "local" && googleConnected ? (
              <Button
                type="button"
                variant="secondary"
                disabled={exportMutation.isPending}
                onClick={() => void handleExportToGoogle()}
              >
                {exportMutation.isPending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {exportMutation.isPending ? "Mengekspor…" : "Ekspor ke Google"}
              </Button>
            ) : null}
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
            ) : null}
          </div>
          <div className="flex gap-3 sm:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Tutup
            </Button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canSubmit || isSubmitting || !recurrenceValid}
                >
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
