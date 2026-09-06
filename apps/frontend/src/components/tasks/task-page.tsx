import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
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
import {
  taskQueryOptions,
  tasksQueryOptions,
  useCreateTask,
  useDeleteTask,
  useSetTaskStatus,
  useUpdateTask,
} from "@/lib/services/api/tasks/tasks.queries";
import type {
  CreateTaskInput,
  Task,
  TaskDueFilter,
  TaskFilters,
  TaskPriority,
  TaskStatus,
} from "@/lib/services/api/tasks/tasks.api";
import {
  formatDateTime,
  formatRelativeDay,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Masukkan judul tugas."),
  description: z.string(),
  status: z.enum(["inbox", "doing", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]),
  dueAt: z.string(),
  tags: z.string(),
});

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  doing: "Dikerjakan",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

const DUE_LABELS: Record<TaskDueFilter | "all", string> = {
  all: "Semua tenggat",
  today: "Hari ini",
  upcoming: "Mendatang",
  overdue: "Terlambat",
  none: "Tanpa tenggat",
};

function taskValues(task?: Task) {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? ("inbox" as const),
    priority: task?.priority ?? ("medium" as const),
    dueAt: toDateTimeLocal(task?.dueAt ?? null),
    tags: task?.tags.join(", ") ?? "",
  };
}

function TaskEditor({ task, onClose }: { task?: Task; onClose: () => void }) {
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const mutation = task ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: taskValues(task),
    validators: { onChange: taskSchema },
    onSubmit: async ({ value }) => {
      const values: CreateTaskInput = {
        title: value.title.trim(),
        description: value.description.trim() || null,
        priority: value.priority,
        dueAt: fromDateTimeLocal(value.dueAt),
        tags: value.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };

      if (task) {
        await updateMutation.mutateAsync({
          taskId: task.id,
          values: { ...values, status: value.status },
        });
      } else {
        await createMutation.mutateAsync(values);
      }

      onClose();
    },
  });

  async function handleDelete() {
    if (
      !task ||
      !window.confirm(
        `Hapus tugas “${task.title}”? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    await deleteMutation.mutateAsync(task.id);
    onClose();
  }

  return (
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogTitle>{task ? "Rincian tugas" : "Tugas baru"}</DialogTitle>
      <DialogDescription className="mt-2">
        {task
          ? "Periksa dan koreksi tugas yang tersimpan."
          : "Tambahkan tugas terstruktur untuk ditindaklanjuti."}
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
              id="task-title"
              label="Judul"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="task-title"
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
        <form.Field name="description">
          {(field) => (
            <FieldShell id="task-description" label="Catatan">
              {({ describedBy }) => (
                <Textarea
                  id="task-description"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="dueAt">
            {(field) => (
              <FieldShell id="task-due" label="Tenggat">
                {({ describedBy }) => (
                  <TextField
                    id="task-due"
                    type="datetime-local"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FieldShell>
            )}
          </form.Field>
          <form.Field name="priority">
            {(field) => (
              <FieldShell id="task-priority" label="Prioritas">
                {({ describedBy }) => (
                  <SelectField
                    id="task-priority"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.value as TaskPriority)
                    }
                  >
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectField>
                )}
              </FieldShell>
            )}
          </form.Field>
        </div>
        {task ? (
          <form.Field name="status">
            {(field) => (
              <FieldShell
                id="task-status"
                label="Status"
                description="Pindahkan tugas ke tahap kerja yang sesuai."
              >
                {({ describedBy }) => (
                  <SelectField
                    id="task-status"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.value as TaskStatus)
                    }
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectField>
                )}
              </FieldShell>
            )}
          </form.Field>
        ) : null}
        <form.Field name="tags">
          {(field) => (
            <FieldShell
              id="task-tags"
              label="Tag"
              description="Pisahkan beberapa tag dengan koma."
            >
              {({ describedBy }) => (
                <TextField
                  id="task-tags"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <FormError
          message={mutation.error?.message ?? deleteMutation.error?.message}
        />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-between">
          {task ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              <Trash2 />{" "}
              {deleteMutation.isPending ? "Menghapus…" : "Hapus tugas"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3 sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
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
                  {isSubmitting ? "Menyimpan…" : "Simpan tugas"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

function TaskEditorLoader({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const query = useQuery(taskQueryOptions(taskId));

  if (query.isPending) {
    return (
      <DialogContent>
        <DialogTitle>Rincian tugas</DialogTitle>
        <DialogDescription className="mt-2">
          Memuat tugas yang tersimpan…
        </DialogDescription>
        <DomainListSkeleton label="Memuat rincian tugas" />
      </DialogContent>
    );
  }

  if (query.isError) {
    return (
      <DialogContent>
        <DialogTitle>Tugas tidak dapat dimuat</DialogTitle>
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

  return <TaskEditor task={query.data} onClose={onClose} />;
}

const TASK_COLUMNS: Array<{
  status: TaskStatus;
  label: string;
  emptyMessage: string;
  icon: typeof Inbox;
}> = [
  {
    status: "inbox",
    label: STATUS_LABELS.inbox,
    emptyMessage: "Belum ada tugas baru.",
    icon: Inbox,
  },
  {
    status: "doing",
    label: STATUS_LABELS.doing,
    emptyMessage: "Tidak ada tugas yang sedang dikerjakan.",
    icon: CircleDot,
  },
  {
    status: "done",
    label: STATUS_LABELS.done,
    emptyMessage: "Belum ada tugas yang selesai.",
    icon: CheckCircle2,
  },
  {
    status: "cancelled",
    label: STATUS_LABELS.cancelled,
    emptyMessage: "Tidak ada tugas yang dibatalkan.",
    icon: Ban,
  },
];

function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const statusMutation = useSetTaskStatus();
  const statusId = `task-${task.id}-status`;

  return (
    <li>
      <article
        className={cn(
          "rounded-sm border border-surface-1 bg-canvas p-4",
          task.status === "doing" && "border-warn/40",
          task.status === "done" && "border-brand-deep/30 bg-surface-2",
          task.status === "cancelled" &&
            "border-destructive/30 bg-destructive/5"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            className={cn(
              "font-display text-base leading-snug font-semibold text-ink",
              task.status === "done" && "text-editorial",
              task.status === "cancelled" && "text-ink-muted line-through"
            )}
          >
            {task.title}
          </h3>
          {task.priority === "high" ? (
            <Badge dot="warn" className="shrink-0 px-2 py-0.5 text-xs">
              Tinggi
            </Badge>
          ) : null}
        </div>
        {task.description ? (
          <p className="mt-2 line-clamp-3 text-sm text-ink-muted">
            {task.description}
          </p>
        ) : null}
        <div className="mt-4 space-y-2 text-sm text-ink-muted">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-4" />
            {task.dueAt ? formatRelativeDay(task.dueAt) : "Tanpa tenggat"}
          </span>
          {task.tags.length ? (
            <p className="line-clamp-2">
              {task.tags.map((tag) => `#${tag}`).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="mt-5 border-t border-surface-1 pt-4">
          <label
            className="block font-display text-xs font-semibold text-ink-soft"
            htmlFor={statusId}
          >
            Pindahkan ke
          </label>
          <SelectField
            id={statusId}
            className="mt-2 h-9 text-sm"
            value={task.status}
            disabled={statusMutation.isPending}
            onChange={(event) =>
              statusMutation.mutate({
                taskId: task.id,
                status: event.target.value as TaskStatus,
              })
            }
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={onEdit}
          >
            <Pencil /> Lihat rincian
          </Button>
          {statusMutation.error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {statusMutation.error.message}
            </p>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function TaskColumn({
  status,
  label,
  emptyMessage,
  icon: Icon,
  tasks,
  filtered,
  onEdit,
  onCreate,
}: (typeof TASK_COLUMNS)[number] & {
  tasks: Task[];
  filtered: boolean;
  onEdit: (task: Task) => void;
  onCreate: () => void;
}) {
  const headingId = `task-column-${status}`;

  return (
    <section
      className="min-w-72 snap-start xl:min-w-0"
      aria-labelledby={headingId}
    >
      <header className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "size-5 text-ink-weak",
              status === "doing" && "text-warn",
              status === "done" && "text-brand-deep",
              status === "cancelled" && "text-destructive"
            )}
          />
          <h2 id={headingId} className="font-display text-base font-semibold">
            {label}
          </h2>
        </div>
        <span
          className="min-w-8 rounded-pill bg-surface-1 px-2 py-1 text-center font-mono text-xs text-ink-soft tabular-nums"
          aria-label={`${tasks.length} tugas`}
        >
          {tasks.length}
        </span>
      </header>
      {tasks.length ? (
        <ul className="mt-4 space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={() => onEdit(task)} />
          ))}
        </ul>
      ) : (
        <div className="py-8 text-sm text-ink-muted">
          <p>
            {filtered
              ? "Tidak ada tugas yang cocok di tahap ini."
              : emptyMessage}
          </p>
          {status === "inbox" && !filtered ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={onCreate}
            >
              <Plus /> Buat tugas
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function TaskPage() {
  const [due, setDue] = useState<TaskDueFilter | "all">("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const filters: TaskFilters = { due, search };
  const query = useQuery(tasksQueryOptions(filters));
  const filtered = Boolean(search || due !== "all");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Tugas"
        description="Pantau setiap tugas dari tangkapan awal sampai selesai—atau batalkan dengan jelas saat rencana berubah."
        action={
          <Button onClick={() => setEditor("new")}>
            <Plus /> Tugas baru
          </Button>
        }
      />
      <section
        aria-label="Filter tugas"
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]"
      >
        <form className="flex gap-2" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="task-search">
            Cari tugas
          </label>
          <Input
            id="task-search"
            type="search"
            placeholder="Cari judul atau catatan"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="dark-outline"
            size="icon"
            aria-label="Cari tugas"
          >
            <Search />
          </Button>
        </form>
        <label>
          <span className="sr-only">Tenggat tugas</span>
          <SelectField
            value={due}
            onChange={(event) =>
              setDue(event.target.value as TaskDueFilter | "all")
            }
          >
            {Object.entries(DUE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
      </section>
      {query.isPending ? (
        <DomainListSkeleton label="Memuat papan tugas" />
      ) : null}
      {query.isError ? (
        <DomainInlineError
          title="Tugas tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess ? (
        <section aria-label="Papan tugas">
          <p className="mb-3 text-sm text-ink-muted xl:sr-only">
            Geser papan ke samping untuk melihat semua tahap.
          </p>
          <div className="grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(18rem,85vw)] gap-4 overflow-x-auto pb-4 xl:grid-flow-row xl:auto-cols-auto xl:grid-cols-4">
            {TASK_COLUMNS.map((column) => (
              <TaskColumn
                key={column.status}
                {...column}
                tasks={query.data.filter(
                  (task) => task.status === column.status
                )}
                filtered={filtered}
                onEdit={setEditor}
                onCreate={() => setEditor("new")}
              />
            ))}
          </div>
        </section>
      ) : null}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        {editor ? (
          editor === "new" ? (
            <TaskEditor key="new" onClose={() => setEditor(null)} />
          ) : (
            <TaskEditorLoader
              key={editor.id}
              taskId={editor.id}
              onClose={() => setEditor(null)}
            />
          )
        ) : null}
      </Dialog>
    </div>
  );
}

export function CompactTaskRow({ task }: { task: Task }) {
  const mutation = useSetTaskStatus();
  const isDone = task.status === "done";
  const isCancelled = task.status === "cancelled";

  return (
    <li className="flex items-start gap-3 py-4">
      <Button
        variant={isDone ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label={
          isCancelled
            ? `${task.title} dibatalkan`
            : isDone
              ? `Kembalikan ${task.title} ke inbox`
              : `Tandai ${task.title} selesai`
        }
        disabled={mutation.isPending || isCancelled}
        onClick={() =>
          mutation.mutate({
            taskId: task.id,
            status: isDone ? "inbox" : "done",
          })
        }
      >
        {mutation.isPending ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" />
        ) : isDone ? (
          <Check />
        ) : isCancelled ? (
          <Ban />
        ) : (
          <CircleDot />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "font-display font-bold",
              isDone && "text-editorial",
              isCancelled && "text-ink-muted line-through"
            )}
          >
            {task.title}
          </p>
          {task.status !== "inbox" ? (
            <Badge
              dot={
                task.status === "doing"
                  ? "warn"
                  : task.status === "done"
                    ? "brand"
                    : "destructive"
              }
              className="px-2 py-0.5 text-xs"
            >
              {STATUS_LABELS[task.status]}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {task.dueAt ? formatDateTime(task.dueAt) : "Tanpa tenggat"}
        </p>
        {mutation.error ? (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </div>
    </li>
  );
}
