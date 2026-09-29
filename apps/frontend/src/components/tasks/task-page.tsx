import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ListFilter,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { TaskFilterPanel, TaskStatusChips } from "./task-filters";
import { TaskListSkeleton, TaskRow } from "./task-row";
import {
  PRIORITY_LABELS,
  SORT_LABELS,
  STATUS_FILTER_LABELS,
  STATUS_LABELS,
  countTasksByStatus,
  filterTasksByStatus,
  isTaskSortKey,
  sortTasks,
  type TaskSortKey,
  type TaskStatusFilter,
} from "./task-view";
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
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";

export type TaskPageProps = {
  taskId?: string;
  onTaskIdChange: (taskId: string | undefined) => void;
};

const taskSchema = z.object({
  title: z.string().trim().min(1, "Masukkan judul tugas."),
  description: z.string(),
  status: z.enum(["inbox", "doing", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]),
  dueAt: z.string(),
  categoryIds: z.array(z.string()).max(5, "Pilih maksimal 5 kategori."),
});

// Task dialogs are bottom sheets on phones and roomy centered dialogs from `sm`.
const TASK_SHEET_CLASS = "sm:max-h-[90dvh] sm:max-w-xl sm:overflow-y-auto";

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
      <DialogContent variant="sheet" className={TASK_SHEET_CLASS}>
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
    <DialogContent variant="sheet" className={TASK_SHEET_CLASS}>
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
    <DialogContent variant="sheet" className={TASK_SHEET_CLASS}>
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
                  // Only new tasks grab focus, so opening details on a phone
                  // does not pop the keyboard over the content.
                  autoFocus={!task}
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
      <DialogContent variant="sheet" className={TASK_SHEET_CLASS}>
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
      <DialogContent variant="sheet" className={TASK_SHEET_CLASS}>
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

type TaskListEmptyProps = {
  filtered: boolean;
  onReset: () => void;
  onCreate: () => void;
};

function TaskListEmpty({ filtered, onReset, onCreate }: TaskListEmptyProps) {
  return (
    <div className="rounded-lg border border-dashed border-ink/12 px-6 py-12 text-center">
      <p className="font-display text-base font-semibold text-ink">
        {filtered ? "Tidak ada tugas yang cocok" : "Belum ada tugas"}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
        {filtered
          ? "Coba ubah kata kunci pencarian atau longgarkan filternya."
          : "Tambahkan tugas pertamamu, lalu centang saat sudah selesai."}
      </p>
      {filtered ? (
        <Button
          type="button"
          variant="dark-outline"
          size="sm"
          className="mt-5"
          onClick={onReset}
        >
          Hapus filter
        </Button>
      ) : (
        <Button type="button" size="sm" className="mt-5" onClick={onCreate}>
          <Plus /> Tugas baru
        </Button>
      )}
    </div>
  );
}

export function TaskPage({ taskId, onTaskIdChange }: TaskPageProps) {
  const [status, setStatus] = useState<TaskStatusFilter>("all");
  const [due, setDue] = useState<TaskDueFilter | "all">("all");
  const [sort, setSort] = useState<TaskSortKey>("due");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Captured once so relative due dates stay stable across re-renders.
  const [now] = useState(() => new Date());
  const statusMutation = useSetTaskStatus();
  const deleteMutation = useDeleteTask();

  const categoriesQuery = useQuery(categoriesQueryOptions());
  const filters: TaskFilters = {
    due,
    search,
    categoryIds: selectedCategoryIds,
  };

  const query = useQuery(tasksQueryOptions(filters));

  const counts = useMemo(
    () => (query.data ? countTasksByStatus(query.data) : undefined),
    [query.data]
  );

  const deletingTaskId = deleteMutation.isPending
    ? deleteMutation.variables
    : undefined;

  const visibleTasks = useMemo(
    () =>
      sortTasks(filterTasksByStatus(query.data ?? [], status), sort).filter(
        (task) => task.id !== deletingTaskId
      ),
    [query.data, status, sort, deletingTaskId]
  );

  const sheetFilterCount = (due === "all" ? 0 : 1) + selectedCategoryIds.length;

  const filtered = Boolean(search || status !== "all" || sheetFilterCount);
  const rowError = statusMutation.error ?? deleteMutation.error;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((ids) =>
      ids.includes(categoryId)
        ? ids.filter((id) => id !== categoryId)
        : [...ids, categoryId]
    );
  }

  function resetSheetFilters() {
    setDue("all");
    setSelectedCategoryIds([]);
  }

  function resetFilters() {
    resetSheetFilters();
    setStatus("all");
    setSearch("");
    setSearchDraft("");
  }

  function changeTaskStatus(task: Task, nextStatus: TaskStatus) {
    if (nextStatus === task.status) return;
    deleteMutation.reset();
    statusMutation.mutate({ taskId: task.id, status: nextStatus });
  }

  function removeTask(task: Task) {
    if (
      !window.confirm(
        `Hapus tugas “${task.title}”? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    statusMutation.reset();
    deleteMutation.mutate(task.id);
  }

  function openCategoryManager() {
    setFiltersOpen(false);
    setCategoryManagerOpen(true);
  }

  const filterPanelProps = {
    status,
    counts,
    due,
    categories: categoriesQuery.data ?? [],
    categoriesLoading: categoriesQuery.isPending,
    selectedCategoryIds,
    onStatusChange: setStatus,
    onDueChange: setDue,
    onCategoryToggle: toggleCategory,
    onManageCategories: openCategoryManager,
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <DomainPageHeader
        title="Tugas"
        action={
          <Button onClick={() => setNewEditorOpen(true)}>
            <Plus /> Tugas baru
          </Button>
        }
      />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:items-start xl:gap-8">
        <section
          aria-labelledby="task-list-heading"
          className="min-w-0 space-y-4"
        >
          <h2 id="task-list-heading" className="sr-only">
            Daftar tugas
          </h2>
          <div className="flex gap-2">
            <form
              className="relative min-w-0 flex-1"
              role="search"
              onSubmit={submitSearch}
            >
              <label className="sr-only" htmlFor="task-search">
                Cari tugas
              </label>
              <Input
                id="task-search"
                type="search"
                enterKeyHint="search"
                placeholder="Cari judul atau catatan"
                className="pr-12"
                value={searchDraft}
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                  // Clearing the field (including the native ✕) resets results.
                  if (!event.target.value) setSearch("");
                }}
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="absolute top-0.5 right-0.5 px-0"
                aria-label="Cari tugas"
              >
                <Search />
              </Button>
            </form>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="dark-outline"
                    size="icon"
                    className="relative sm:w-auto sm:px-4"
                  />
                }
              >
                <ArrowDownUp />
                <span className="max-sm:sr-only">Urutkan</span>
                <span className="sr-only">: {SORT_LABELS[sort]}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuRadioGroup
                  aria-label="Urutkan tugas"
                  value={sort}
                  onValueChange={(value: unknown) => {
                    if (isTaskSortKey(value)) setSort(value);
                  }}
                >
                  {(Object.keys(SORT_LABELS) as TaskSortKey[]).map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {SORT_LABELS[value]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="dark-outline"
              size="icon"
              className="relative sm:w-auto sm:px-4 xl:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              <ListFilter />
              <span className="max-sm:sr-only">Filter</span>
              {sheetFilterCount ? (
                <>
                  <span className="sr-only"> ({sheetFilterCount} aktif)</span>
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-pill bg-brand px-1 text-[11px] font-bold text-canvas"
                  >
                    {sheetFilterCount}
                  </span>
                </>
              ) : null}
            </Button>
          </div>
          <TaskStatusChips
            className="xl:hidden"
            status={status}
            counts={counts}
            onStatusChange={setStatus}
          />
          <div
            className="flex min-h-9 items-center justify-between gap-3 text-sm text-ink-muted"
            aria-live="polite"
          >
            <p>
              {query.isSuccess ? (
                <>
                  <span className="font-semibold text-ink tabular-nums">
                    {visibleTasks.length}
                  </span>{" "}
                  tugas
                  {status === "all"
                    ? null
                    : ` · ${STATUS_FILTER_LABELS[status]}`}
                  {search ? ` · “${search}”` : null}
                </>
              ) : null}
            </p>
            {filtered ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="min-h-9 px-0 py-0"
                onClick={resetFilters}
              >
                <X /> Hapus filter
              </Button>
            ) : null}
          </div>
          {rowError ? (
            <p className="text-sm text-destructive" role="alert">
              {rowError.message}
            </p>
          ) : null}
          {query.isPending ? (
            <TaskListSkeleton label="Memuat daftar tugas" />
          ) : null}
          {query.isError ? (
            <DomainInlineError
              title="Tugas tidak dapat dimuat"
              message={query.error.message}
              onRetry={() => void query.refetch()}
            />
          ) : null}
          {query.isSuccess ? (
            visibleTasks.length ? (
              <ul className="space-y-2">
                {visibleTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    now={now}
                    pendingStatus={
                      statusMutation.isPending &&
                      statusMutation.variables.taskId === task.id
                        ? statusMutation.variables.status
                        : undefined
                    }
                    onOpen={() => onTaskIdChange(task.id)}
                    onStatusChange={(nextStatus) =>
                      changeTaskStatus(task, nextStatus)
                    }
                    onDelete={() => removeTask(task)}
                  />
                ))}
              </ul>
            ) : (
              <TaskListEmpty
                filtered={filtered}
                onReset={resetFilters}
                onCreate={() => setNewEditorOpen(true)}
              />
            )
          ) : null}
        </section>
        <aside
          aria-label="Filter tugas"
          className="hidden rounded-lg border border-hairline bg-canvas p-2 shadow-card xl:sticky xl:top-12 xl:block"
        >
          <TaskFilterPanel {...filterPanelProps} />
        </aside>
      </div>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent variant="sheet" showClose={false}>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Filter tugas</DialogTitle>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2"
                  aria-label="Tutup"
                />
              }
            >
              <X />
            </DialogClose>
          </div>
          <TaskFilterPanel
            {...filterPanelProps}
            showStatus={false}
            className="-mx-3 mt-3"
          />
          <div className="mt-5 flex gap-3">
            <Button
              type="button"
              variant="dark-outline"
              className="flex-1"
              disabled={!sheetFilterCount}
              onClick={resetSheetFilters}
            >
              Atur ulang
            </Button>
            <DialogClose render={<Button type="button" className="flex-1" />}>
              Terapkan
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={newEditorOpen || taskId !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            if (newEditorOpen) setNewEditorOpen(false);
            if (taskId !== undefined) onTaskIdChange(undefined);
          }
        }}
      >
        {newEditorOpen ? (
          <TaskEditor key="new" onClose={() => setNewEditorOpen(false)} />
        ) : taskId ? (
          <TaskEditorLoader
            key={taskId}
            taskId={taskId}
            onClose={() => onTaskIdChange(undefined)}
          />
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
