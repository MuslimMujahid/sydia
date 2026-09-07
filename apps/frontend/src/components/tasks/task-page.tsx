import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  Inbox,
  Flag,
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
  categoriesQueryOptions,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/lib/services/api/categories/categories.queries";
import type {
  Category,
  CategoryColor,
  CategoryIconKey,
} from "@/lib/services/api/categories/categories.api";
import { CategoryIcon } from "./category-icon";
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
  categoryIds: z.array(z.string()).max(5, "Pilih maksimal 5 kategori."),
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
    categoryIds: task?.categories.map((category) => category.id) ?? [],
  };
}

const CATEGORY_COLORS: CategoryColor[] = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "orange",
];

const CATEGORY_COLOR_CLASS: Record<CategoryColor, string> = {
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
};

const CATEGORY_ICONS: CategoryIconKey[] = [
  "briefcase",
  "heart",
  "wallet",
  "book",
  "health",
  "family",
  "shopping",
  "star",
  "home",
  "travel",
];

function CategoryPicker({
  categories,
  selected,
  loading,
  onChange,
}: {
  categories: Category[];
  selected: string[];
  loading: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-display text-sm font-semibold text-ink">
        Kategori
      </legend>
      <p className="text-xs text-ink-muted">Pilih maksimal 5.</p>
      <div className="flex flex-wrap gap-2" aria-busy={loading}>
        {categories.map((category) => {
          const checked = selected.includes(category.id);

          return (
            <label
              key={category.id}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-surface-1 bg-canvas px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="accent-brand-deep"
                checked={checked}
                disabled={!checked && selected.length >= 5}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((id) => id !== category.id)
                      : [...selected, category.id]
                  )
                }
              />
              <CategoryIcon iconKey={category.iconKey} color={category.color} />
              {category.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type CategoryManagerView =
  { mode: "list" } | { mode: "add" } | { mode: "edit"; category: Category };

function CategoryManager({
  onDeleted,
}: {
  onDeleted: (categoryId: string) => void;
}) {
  const categoriesQuery = useQuery(categoriesQueryOptions());
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();
  const [view, setView] = useState<CategoryManagerView>({ mode: "list" });
  const [name, setName] = useState("");
  const [color, setColor] = useState<CategoryColor>("blue");
  const [iconKey, setIconKey] = useState<CategoryIconKey>("star");

  const categories = categoriesQuery.data ?? [];
  const atLimit = categories.length >= 25;

  function openAdd() {
    createMutation.reset();
    deleteMutation.reset();
    setName("");
    setColor("blue");
    setIconKey("star");
    setView({ mode: "add" });
  }

  function openEdit(category: Category) {
    updateMutation.reset();
    deleteMutation.reset();
    setName(category.name);
    setColor(category.color);
    setIconKey(category.iconKey);
    setView({ mode: "edit", category });
  }

  function cancelForm() {
    createMutation.reset();
    updateMutation.reset();
    setView({ mode: "list" });
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (view.mode === "edit") {
      if (updateMutation.isPending) return;
      await updateMutation.mutateAsync({
        categoryId: view.category.id,
        values: { name: trimmed, color, iconKey },
      });
    } else if (view.mode === "add") {
      if (createMutation.isPending || atLimit) return;
      await createMutation.mutateAsync({ name: trimmed, color, iconKey });
    } else {
      return;
    }

    setView({ mode: "list" });
  }

  async function remove(category: Category) {
    if (
      !window.confirm(
        `Hapus kategori “${category.name}”? Kategori akan dilepas dari ${category.taskCount} tugas.`
      )
    )
      return;
    await deleteMutation.mutateAsync(category.id);
    onDeleted(category.id);
  }

  if (view.mode !== "list") {
    const editing = view.mode === "edit" ? view.category : undefined;
    const mutation = editing ? updateMutation : createMutation;

    return (
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogTitle>
          {editing ? "Ubah kategori" : "Tambah kategori"}
        </DialogTitle>
        <DialogDescription className="mt-2">
          {editing
            ? `Perbarui nama, warna, dan ikon kategori “${editing.name}”.`
            : "Buat kategori baru untuk mengelompokkan tugasmu."}
        </DialogDescription>
        <form
          className="mt-7 space-y-4"
          onSubmit={(event) => void submitForm(event)}
        >
          <Input
            value={name}
            maxLength={40}
            placeholder="Nama kategori"
            aria-label="Nama kategori"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <div className="space-y-3">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">
                Ikon
              </legend>
              <div className="flex flex-wrap gap-1" aria-label="Warna kategori">
                {CATEGORY_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "grid size-10 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                      color === value &&
                        "ring-2 ring-ink ring-offset-2 ring-offset-canvas"
                    )}
                    aria-label={`Pilih warna ${value}`}
                    aria-pressed={color === value}
                    onClick={() => setColor(value)}
                  >
                    <span
                      className={cn(
                        "size-6 rounded-full",
                        CATEGORY_COLOR_CLASS[value]
                      )}
                    />
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-1" aria-label="Ikon kategori">
              {CATEGORY_ICONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "rounded-lg p-1",
                    iconKey === value && "ring-2 ring-brand-deep"
                  )}
                  aria-label={`Pilih ikon ${value}`}
                  aria-pressed={iconKey === value}
                  onClick={() => setIconKey(value)}
                >
                  <CategoryIcon iconKey={value} color={color} />
                </button>
              ))}
            </div>
          </div>
          <FormError message={mutation.error?.message} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="dark-outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={cancelForm}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!name.trim() || mutation.isPending}
            >
              {mutation.isPending
                ? "Menyimpan…"
                : editing
                  ? "Simpan"
                  : "Tambah"}
            </Button>
          </div>
        </form>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogTitle>Kelola kategori</DialogTitle>
      <DialogDescription className="mt-2">
        Buat, ubah, atau hapus kategori. Perubahan berlaku untuk semua tugas.
      </DialogDescription>
      {categoriesQuery.isPending ? (
        <DomainListSkeleton label="Memuat kategori" />
      ) : categoriesQuery.isError ? (
        <DomainInlineError
          title="Kategori tidak dapat dimuat"
          message={categoriesQuery.error.message}
          onRetry={() => void categoriesQuery.refetch()}
        />
      ) : (
        <>
          {categories.length ? (
            <ul className="mt-7 flex flex-wrap gap-2">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center gap-1 rounded-full border border-surface-1 bg-canvas py-1 pl-2.5 pr-1"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <CategoryIcon
                      iconKey={category.iconKey}
                      color={category.color}
                    />
                    <span className="truncate">{category.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {category.taskCount}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 rounded-full p-0"
                    disabled={
                      updateMutation.isPending || deleteMutation.isPending
                    }
                    aria-label={`Ubah ${category.name}`}
                    title={`Ubah ${category.name}`}
                    onClick={() => openEdit(category)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 rounded-full p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    aria-label={`Hapus ${category.name}`}
                    title={`Hapus ${category.name}`}
                    onClick={() => void remove(category)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-7 text-sm text-ink-muted">
              Belum ada kategori. Tambahkan yang pertama dengan tombol &ldquo;+
              Tambah&rdquo; di bawah.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={atLimit}
              onClick={openAdd}
            >
              <Plus /> Tambah
            </Button>
            {atLimit ? (
              <p className="text-xs text-ink-muted">
                Batas maksimal 25 kategori tercapai.
              </p>
            ) : null}
          </div>
          <FormError message={deleteMutation.error?.message} />
        </>
      )}
    </DialogContent>
  );
}

function TaskEditor({ task, onClose }: { task?: Task; onClose: () => void }) {
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const categoriesQuery = useQuery(categoriesQueryOptions());
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
        categoryIds: value.categoryIds,
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
        <form.Field name="categoryIds">
          {(field) => (
            <CategoryPicker
              categories={categoriesQuery.data ?? []}
              selected={field.state.value}
              loading={categoriesQuery.isPending}
              onChange={field.handleChange}
            />
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
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { status: task.status },
    });

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <li ref={setNodeRef} style={dragStyle} className="touch-none">
      <article
        {...attributes}
        {...listeners}
        className={cn(
          "group cursor-grab rounded-sm border border-surface-1 bg-canvas p-4 transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-ink-weak/50 hover:shadow-[0_8px_24px_-18px_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep active:cursor-grabbing",
          task.status === "doing" && "border-warn/40",
          task.status === "done" && "border-brand-deep/30 bg-surface-2",
          task.status === "cancelled" &&
            "border-destructive/30 bg-destructive/5",
          isDragging && "z-20 scale-[1.02] cursor-grabbing opacity-70 shadow-lg"
        )}
        onClick={() => {
          if (!isDragging) onEdit();
        }}
        onKeyDown={(event) => {
          listeners?.onKeyDown?.(event);
          if (event.key === "Enter" && !event.defaultPrevented) onEdit();
        }}
      >
        <h3
          className={cn(
            "font-display text-base leading-snug font-semibold text-ink",
            task.status === "done" && "text-editorial",
            task.status === "cancelled" && "text-ink-muted line-through"
          )}
        >
          {task.title}
        </h3>
        {task.categories.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {task.categories.map((category) => (
              <span
                key={category.id}
                className="inline-flex items-center gap-1 rounded-pill bg-surface-1 py-1 pr-2 pl-1 text-xs font-medium text-ink-soft"
              >
                <CategoryIcon
                  iconKey={category.iconKey}
                  color={category.color}
                  className="size-4.5 rounded-md [&_svg]:size-3"
                />
                {category.name}
              </span>
            ))}
          </div>
        ) : null}
        {task.description ? (
          <p className="mt-3 line-clamp-3 text-sm text-ink-muted">
            {task.description}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-4 border-t border-surface-1 pt-3 text-xs text-ink-muted">
          <span className="flex min-w-0 items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" />
            <span className="truncate">
              {task.dueAt ? formatRelativeDay(task.dueAt) : "Tanpa tenggat"}
            </span>
          </span>
          <span
            className={cn(
              "ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-1",
              task.priority === "high" && "bg-warn/15 text-warn",
              task.priority === "low" && "text-ink-weak"
            )}
            title={`Prioritas ${PRIORITY_LABELS[task.priority].toLowerCase()}`}
            aria-label={`Prioritas ${PRIORITY_LABELS[task.priority].toLowerCase()}`}
          >
            <Flag className="size-3.5" aria-hidden="true" />
          </span>
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
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "min-w-72 snap-start rounded-sm transition-colors xl:min-w-0",
        isOver &&
          "bg-brand-soft/35 outline-2 outline-offset-4 outline-brand-deep/30"
      )}
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
        <ul className="mt-4 min-h-24 space-y-3">
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const statusMutation = useSetTaskStatus();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const categoriesQuery = useQuery(categoriesQueryOptions());
  const filters: TaskFilters = {
    due,
    search,
    categoryIds: selectedCategoryIds,
  };

  const query = useQuery(tasksQueryOptions(filters));
  const filtered = Boolean(
    search || due !== "all" || selectedCategoryIds.length
  );

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  function moveTask(event: DragEndEvent) {
    const destination = event.over?.id as TaskStatus | undefined;
    const current = event.active.data.current?.status as TaskStatus | undefined;

    if (!destination || !current || destination === current) return;

    statusMutation.mutate({
      taskId: String(event.active.id),
      status: destination,
    });
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
      <fieldset>
        <legend className="sr-only">Filter kategori</legend>
        <div className="flex flex-wrap items-center gap-2">
          {(categoriesQuery.data ?? []).map((category) => {
            const active = selectedCategoryIds.includes(category.id);

            return (
              <button
                key={category.id}
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1.5 text-sm",
                  active
                    ? "border-brand-deep bg-brand-deep text-white"
                    : "border-surface-1 bg-canvas text-ink-soft"
                )}
                aria-pressed={active}
                onClick={() =>
                  setSelectedCategoryIds(
                    active
                      ? selectedCategoryIds.filter((id) => id !== category.id)
                      : [...selectedCategoryIds, category.id]
                  )
                }
              >
                <CategoryIcon
                  iconKey={category.iconKey}
                  color={category.color}
                  className="size-5 rounded-md [&_svg]:size-3.5"
                />
                {category.name}
              </button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Kelola kategori"
            title="Kelola kategori"
            onClick={() => setCategoryManagerOpen(true)}
          >
            <Pencil />
          </Button>
        </div>
      </fieldset>
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
            Geser papan ke samping untuk melihat semua tahap. Seret kartu untuk
            memindahkan tugas.
          </p>
          {statusMutation.error ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {statusMutation.error.message}
            </p>
          ) : null}
          <DndContext sensors={sensors} onDragEnd={moveTask}>
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
          </DndContext>
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
      <Dialog
        open={categoryManagerOpen}
        onOpenChange={(open) => {
          if (!open) setCategoryManagerOpen(false);
        }}
      >
        {categoryManagerOpen ? (
          <CategoryManager
            onDeleted={(categoryId) =>
              setSelectedCategoryIds((ids) =>
                ids.filter((id) => id !== categoryId)
              )
            }
          />
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
