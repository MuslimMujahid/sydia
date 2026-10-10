import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { DateTimeField } from "@/components/forms/date-time-field";
import {
  FieldShell,
  FormError,
  SelectField,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
import {
  fromDateTimeLocal,
  splitDateTimeLocal,
  toDateTimeLocal,
} from "@/lib/utils/date-time";
import { addDays } from "./calendar-date";
import { changedEventValues } from "./calendar-event-write";

const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Masukkan judul minimal 2 karakter."),
    isAllDay: z.boolean(),
    startAt: z.string().min(1, "Pilih waktu mulai."),
    endAt: z.string().min(1, "Pilih waktu selesai."),
    allDayStartDate: z.string(),
    allDayEndDate: z.string(),
    location: z.string(),
    description: z.string(),
    attendees: z.string(),
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
  { name: "startAt", id: "event-start", label: "Mulai", defaultTime: "09:00" },
  { name: "endAt", id: "event-end", label: "Selesai", defaultTime: "10:00" },
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
  const [destination, setDestination] = useState<"google" | "local">(
    googleConnected ? "google" : "local"
  );

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
        ? toDateTimeLocal(event.startAt)
        : (initialStartAt ?? ""),
      endAt: event?.endAt ? toDateTimeLocal(event.endAt) : (initialEndAt ?? ""),
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
    },
    validators: { onChange: eventSchema },
    onSubmit: async ({ value }) => {
      const common = {
        title: value.title.trim(),
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
        const startAt = fromDateTimeLocal(value.startAt);
        const endAt = fromDateTimeLocal(value.endAt);
        if (!startAt || !endAt) return;
        values = { ...common, startAt, endAt, timezone };
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
      className="sm:max-h-[90dvh] sm:max-w-2xl sm:overflow-y-auto"
    >
      {header}
      <DialogTitle>{event ? "Edit acara" : "Acara baru"}</DialogTitle>
      <DialogDescription className="mt-2">
        {event
          ? event.provider === "google"
            ? "Perubahan akan tersimpan di Sydia dan dijadwalkan untuk disinkronkan ke Google."
            : "Perubahan hanya akan tersimpan di Sydia."
          : destination === "google"
            ? "Acara akan tersimpan di Sydia dan dijadwalkan untuk disinkronkan ke Google."
            : "Acara akan tersimpan hanya di Sydia."}
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
        {!event && googleConnected ? (
          <FieldShell
            id="event-destination"
            label="Simpan acara di"
            description="Acara Google Calendar tetap tersedia di Sydia."
          >
            {({ describedBy }) => (
              <SelectField
                id="event-destination"
                value={destination}
                aria-describedby={describedBy}
                onChange={(inputEvent) => {
                  destinationTouched.current = true;
                  setDestination(
                    inputEvent.target.value === "google" ? "google" : "local"
                  );
                }}
              >
                <option value="google">Google Calendar</option>
                <option value="local">Sydia saja</option>
              </SelectField>
            )}
          </FieldShell>
        ) : null}
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
        <form.Field name="isAllDay">
          {(field) => (
            <label className="flex min-h-9 items-center gap-2 text-sm text-ink">
              <Checkbox
                checked={field.state.value}
                disabled={Boolean(event)}
                onCheckedChange={(checked) =>
                  field.handleChange(checked === true)
                }
              />
              Sepanjang hari
              {event ? (
                <span className="text-xs text-ink-muted">
                  Jenis waktu acara yang tersimpan tidak dapat diubah.
                </span>
              ) : null}
            </label>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.isAllDay}>
          {(isAllDay) =>
            isAllDay ? (
              <div className="grid gap-5 sm:grid-cols-2">
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
              EVENT_TIME_FIELDS.map(({ name, id, label, defaultTime }) => (
                <form.Field key={name} name={name}>
                  {(field) => {
                    const { date, time } = splitDateTimeLocal(
                      field.state.value
                    );

                    return (
                      <DateTimeField
                        id={id}
                        label={label}
                        date={date}
                        time={time}
                        errors={field.state.meta.errors}
                        onDateChange={(nextDate) =>
                          field.handleChange(
                            joinDateTimeLocal(nextDate, time || defaultTime)
                          )
                        }
                        onTimeChange={(nextTime) =>
                          field.handleChange(joinDateTimeLocal(date, nextTime))
                        }
                        onBlur={field.handleBlur}
                      />
                    );
                  }}
                </form.Field>
              ))
            )
          }
        </form.Subscribe>
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
          message={
            mutation.error?.message ??
            retrySyncMutation.error?.message ??
            deleteMutation.error?.message ??
            exportMutation.error?.message
          }
        />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-between">
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
