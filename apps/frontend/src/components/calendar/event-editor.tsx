import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
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
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
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

export type EventEditorProps = {
  event?: CalendarEvent;
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
  initialStartAt,
  initialEndAt,
  timezone,
  header,
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
    <DialogContent
      variant="sheet"
      className="sm:max-h-[90dvh] sm:max-w-2xl sm:overflow-y-auto"
    >
      {header}
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
