import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  Ban,
  CalendarClock,
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import {
  FieldShell,
  FormError,
  SelectField,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/lib/hooks/forms";
import type {
  CreateReminderInput,
  RecurrenceFrequency,
  Reminder,
  ReminderFilters,
  ReminderScheduleFilter,
  ReminderStatus,
} from "@/lib/services/api/reminders/reminders.api";
import {
  reminderQueryOptions,
  remindersQueryOptions,
  useCreateReminder,
  useDeleteReminder,
  useRescheduleReminder,
  useSetReminderStatus,
  useSnoozeReminder,
  useUpdateReminder,
} from "@/lib/services/api/reminders/reminders.queries";
import {
  formatDateTime,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";

const reminderSchema = z.object({
  title: z.string().trim().min(1, "Masukkan judul pengingat."),
  notes: z.string(),
  scheduledAt: z.string().min(1, "Pilih waktu pengingat."),
  recurrenceFrequency: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
  recurrenceInterval: z.string(),
});

const FREQUENCY_LABELS: Record<RecurrenceFrequency | "none", string> = {
  none: "Tidak berulang",
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

const STATUS_LABELS: Record<ReminderStatus | "all", string> = {
  all: "Semua status",
  scheduled: "Terjadwal",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const SCHEDULE_LABELS: Record<ReminderScheduleFilter | "all", string> = {
  all: "Semua waktu",
  today: "Hari ini",
  upcoming: "Mendatang",
  past: "Sudah lewat",
};

function formatRecurrence(reminder: Reminder): string | null {
  const recurrence = reminder.recurrence;
  if (!recurrence) return null;
  const frequency = FREQUENCY_LABELS[recurrence.frequency].toLowerCase();

  return recurrence.interval === 1
    ? `Berulang ${frequency}`
    : `Setiap ${recurrence.interval} periode ${frequency}`;
}

function reminderValues(reminder?: Reminder) {
  return {
    title: reminder?.title ?? "",
    notes: reminder?.notes ?? "",
    scheduledAt: toDateTimeLocal(reminder?.scheduledAt ?? null),
    recurrenceFrequency: reminder?.recurrence?.frequency ?? ("none" as const),
    recurrenceInterval: String(reminder?.recurrence?.interval ?? 1),
  };
}

function ReminderEditor({
  reminder,
  onClose,
}: {
  reminder?: Reminder;
  onClose: () => void;
}) {
  const createMutation = useCreateReminder();
  const updateMutation = useUpdateReminder();
  const deleteMutation = useDeleteReminder();
  const mutation = reminder ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: reminderValues(reminder),
    validators: { onChange: reminderSchema },
    onSubmit: async ({ value }) => {
      const scheduledAt = fromDateTimeLocal(value.scheduledAt);
      if (!scheduledAt) return;
      const frequency = value.recurrenceFrequency;
      const values: CreateReminderInput = {
        title: value.title.trim(),
        notes: value.notes.trim() || null,
        scheduledAt,
        recurrence:
          frequency === "none"
            ? null
            : {
                frequency,
                interval: Math.max(
                  1,
                  Number.parseInt(value.recurrenceInterval, 10) || 1
                ),
              },
      };

      if (reminder)
        await updateMutation.mutateAsync({ reminderId: reminder.id, values });
      else await createMutation.mutateAsync(values);
      onClose();
    },
  });

  async function handleDelete() {
    if (
      !reminder ||
      !window.confirm(
        `Hapus pengingat “${reminder.title}”? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    await deleteMutation.mutateAsync(reminder.id);
    onClose();
  }

  return (
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogTitle>
        {reminder ? "Rincian pengingat" : "Pengingat baru"}
      </DialogTitle>
      <DialogDescription className="mt-2">
        {reminder
          ? "Periksa waktu, pengulangan, dan catatan pengingat."
          : "Jadwalkan satu pengingat atau rangkaian berulang."}
      </DialogDescription>
      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          mutation.reset();
          void form.handleSubmit();
        }}
      >
        <form.Field name="title">
          {(field) => (
            <FieldShell
              id="reminder-title"
              label="Judul"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="reminder-title"
                  autoFocus
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <FieldShell id="reminder-notes" label="Catatan">
              {({ describedBy }) => (
                <Textarea
                  id="reminder-notes"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="scheduledAt">
          {(field) => (
            <FieldShell
              id="reminder-time"
              label="Waktu"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="reminder-time"
                  type="datetime-local"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <form.Field name="recurrenceFrequency">
            {(field) => (
              <FieldShell id="reminder-repeat" label="Pengulangan">
                {({ describedBy }) => (
                  <SelectField
                    id="reminder-repeat"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as RecurrenceFrequency | "none"
                      )
                    }
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectField>
                )}
              </FieldShell>
            )}
          </form.Field>
          <form.Field name="recurrenceInterval">
            {(field) => (
              <FieldShell id="reminder-interval" label="Setiap">
                {({ describedBy }) => (
                  <TextField
                    id="reminder-interval"
                    type="number"
                    min={1}
                    value={field.state.value}
                    aria-describedby={describedBy}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FieldShell>
            )}
          </form.Field>
        </div>
        <FormError
          message={mutation.error?.message ?? deleteMutation.error?.message}
        />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-between">
          {reminder ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              <Trash2 />
              {deleteMutation.isPending ? "Menghapus…" : "Hapus pengingat"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3 sm:justify-end">
            <Button type="button" variant="dark-outline" onClick={onClose}>
              Batal
            </Button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isSubmitting ? "Menyimpan…" : "Simpan pengingat"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

function ReminderEditorLoader({
  reminderId,
  onClose,
}: {
  reminderId: string;
  onClose: () => void;
}) {
  const query = useQuery(reminderQueryOptions(reminderId));

  if (query.isPending) {
    return (
      <DialogContent>
        <DialogTitle>Rincian pengingat</DialogTitle>
        <DialogDescription className="mt-2">
          Memuat pengingat yang tersimpan…
        </DialogDescription>
        <DomainListSkeleton label="Memuat rincian pengingat" />
      </DialogContent>
    );
  }

  if (query.isError) {
    return (
      <DialogContent>
        <DialogTitle>Pengingat tidak dapat dimuat</DialogTitle>
        <DialogDescription className="mt-2">
          {query.error.message}
        </DialogDescription>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => void query.refetch()}
        >
          Coba lagi
        </Button>
      </DialogContent>
    );
  }

  return <ReminderEditor reminder={query.data} onClose={onClose} />;
}

function QuickTimeDialog({
  reminder,
  mode,
  onClose,
}: {
  reminder: Reminder;
  mode: "snooze" | "reschedule";
  onClose: () => void;
}) {
  const [value, setValue] = useState(toDateTimeLocal(reminder.scheduledAt));
  const snoozeMutation = useSnoozeReminder();
  const rescheduleMutation = useRescheduleReminder();
  const mutation = mode === "snooze" ? snoozeMutation : rescheduleMutation;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const iso = fromDateTimeLocal(value);
    if (!iso) return;
    if (mode === "snooze")
      await snoozeMutation.mutateAsync({ reminderId: reminder.id, until: iso });
    else
      await rescheduleMutation.mutateAsync({
        reminderId: reminder.id,
        scheduledAt: iso,
      });
    onClose();
  }

  return (
    <DialogContent>
      <DialogTitle>
        {mode === "snooze" ? "Tunda pengingat" : "Jadwalkan ulang"}
      </DialogTitle>
      <DialogDescription className="mt-2">
        Pilih waktu baru untuk “{reminder.title}”.
      </DialogDescription>
      <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)}>
        <FieldShell id="quick-reminder-time" label="Waktu baru">
          {() => (
            <TextField
              id="quick-reminder-time"
              autoFocus
              required
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </FieldShell>
        <FormError message={mutation.error?.message} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="dark-outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={!value || mutation.isPending}>
            {mutation.isPending
              ? "Menyimpan…"
              : mode === "snooze"
                ? "Tunda"
                : "Jadwalkan ulang"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function ReminderRow({
  reminder,
  onEdit,
  onQuickTime,
}: {
  reminder: Reminder;
  onEdit: () => void;
  onQuickTime: (mode: "snooze" | "reschedule") => void;
}) {
  const statusMutation = useSetReminderStatus();
  const active = reminder.status === "scheduled";
  const recurrence = formatRecurrence(reminder);

  return (
    <li className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            className={cn(
              "font-display text-base font-semibold",
              !active && "text-ink-muted"
            )}
          >
            {reminder.title}
          </h2>
          <Badge dot={active ? "brand" : "ink-weak"}>
            {STATUS_LABELS[reminder.status]}
          </Badge>
        </div>
        {reminder.notes ? (
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
            {reminder.notes}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-muted">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-4" />
            {formatDateTime(reminder.scheduledAt)}
          </span>
          {recurrence ? (
            <span className="flex items-center gap-1.5">
              <Repeat2 className="size-4" />
              {recurrence}
            </span>
          ) : null}
        </div>
        {statusMutation.error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {statusMutation.error.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {active ? (
          <>
            <Button
              variant="dark-outline"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({
                  reminderId: reminder.id,
                  status: "completed",
                })
              }
            >
              <Check /> Selesai
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onQuickTime("snooze")}
            >
              <AlarmClock /> Tunda
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onQuickTime("reschedule")}
            >
              <CalendarClock /> Ubah waktu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({
                  reminderId: reminder.id,
                  status: "cancelled",
                })
              }
            >
              <Ban /> Batalkan
            </Button>
          </>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Rincian
        </Button>
      </div>
    </li>
  );
}

export function ReminderPage() {
  const [status, setStatus] = useState<ReminderStatus | "all">("scheduled");
  const [schedule, setSchedule] = useState<ReminderScheduleFilter | "all">(
    "all"
  );

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Reminder | "new" | null>(null);
  const [quickTime, setQuickTime] = useState<{
    reminder: Reminder;
    mode: "snooze" | "reschedule";
  } | null>(null);

  const filters: ReminderFilters = { status, schedule, search };
  const query = useQuery(remindersQueryOptions(filters));

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Pengingat"
        description="Waktu yang perlu Sydia jaga, termasuk jadwal sekali jalan dan pengulangan."
        action={
          <Button onClick={() => setEditor("new")}>
            <Plus /> Pengingat baru
          </Button>
        }
      />
      <section
        aria-label="Filter pengingat"
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]"
      >
        <form
          className="flex gap-2"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchDraft.trim());
          }}
        >
          <label className="sr-only" htmlFor="reminder-search">
            Cari pengingat
          </label>
          <Input
            id="reminder-search"
            type="search"
            placeholder="Cari judul atau catatan"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="dark-outline"
            size="icon"
            aria-label="Cari pengingat"
          >
            <Search />
          </Button>
        </form>
        <label>
          <span className="sr-only">Status pengingat</span>
          <SelectField
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ReminderStatus | "all")
            }
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          <span className="sr-only">Waktu pengingat</span>
          <SelectField
            value={schedule}
            onChange={(event) =>
              setSchedule(event.target.value as ReminderScheduleFilter | "all")
            }
          >
            {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
      </section>
      {query.isPending ? (
        <DomainListSkeleton label="Memuat daftar pengingat" />
      ) : null}
      {query.isError ? (
        <DomainInlineError
          title="Pengingat tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && query.data.length === 0 ? (
        <EmptyState
          title={
            search || status !== "all" || schedule !== "all"
              ? "Tidak ada pengingat yang cocok"
              : "Belum ada pengingat"
          }
          message={
            search || status !== "all" || schedule !== "all"
              ? "Ubah pencarian atau filter untuk melihat jadwal lain."
              : "Jadwalkan dari dasbor, atau minta Sydia mengingatkan Anda melalui chat."
          }
        />
      ) : null}
      {query.isSuccess && query.data.length > 0 ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {query.data.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              onEdit={() => setEditor(reminder)}
              onQuickTime={(mode) => setQuickTime({ reminder, mode })}
            />
          ))}
        </ul>
      ) : null}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        {editor ? (
          editor === "new" ? (
            <ReminderEditor key="new" onClose={() => setEditor(null)} />
          ) : (
            <ReminderEditorLoader
              key={editor.id}
              reminderId={editor.id}
              onClose={() => setEditor(null)}
            />
          )
        ) : null}
      </Dialog>
      <Dialog
        open={quickTime !== null}
        onOpenChange={(open) => {
          if (!open) setQuickTime(null);
        }}
      >
        {quickTime ? (
          <QuickTimeDialog
            key={`${quickTime.reminder.id}-${quickTime.mode}`}
            reminder={quickTime.reminder}
            mode={quickTime.mode}
            onClose={() => setQuickTime(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

export function CompactReminderRow({ reminder }: { reminder: Reminder }) {
  const mutation = useSetReminderStatus();

  return (
    <li className="flex items-start gap-3 py-4">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Tandai ${reminder.title} selesai`}
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({ reminderId: reminder.id, status: "completed" })
        }
      >
        {mutation.isPending ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" />
        ) : (
          <AlarmClock />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold">{reminder.title}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {formatDateTime(reminder.scheduledAt)}
        </p>
        {formatRecurrence(reminder) ? (
          <p className="mt-1 text-sm text-ink-muted">
            {formatRecurrence(reminder)}
          </p>
        ) : null}
        {mutation.error ? (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </div>
    </li>
  );
}
