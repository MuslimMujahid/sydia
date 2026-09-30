import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, ListFilter, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import { DomainPageSearch } from "@/components/domain/domain-page-search";
import { FormError } from "@/components/forms/form-fields";
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
import { TASK_SHEET_CLASS, TaskEditor, TaskEditorLoader } from "./task-editor";
import { TaskFilterPanel } from "./task-filters";
import { TaskListSkeleton, TaskRow } from "./task-row";
import {
  SORT_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  groupTasksByStatus,
  isTaskSortKey,
  sortTasks,
  type TaskSortKey,
} from "./task-view";
import {
  tasksQueryOptions,
  useDeleteTask,
  useSetTaskStatus,
} from "@/lib/services/api/tasks/tasks.queries";
import type {
  Task,
  TaskDueFilter,
  TaskFilters,
  TaskStatus,
} from "@/lib/services/api/tasks/tasks.api";
import { cn } from "@/lib/utils/cn";

export type TaskPageProps = {
  taskId?: string;
  onTaskIdChange: (taskId: string | undefined) => void;
  /** Header control that switches between the calendar and task views. */
  modeSwitch?: ReactNode;
};

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

export function TaskPage({
  taskId,
  onTaskIdChange,
  modeSwitch,
}: TaskPageProps) {
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

  const deletingTaskId = deleteMutation.isPending
    ? deleteMutation.variables
    : undefined;

  const visibleTasks = useMemo(
    () =>
      sortTasks(query.data ?? [], sort).filter(
        (task) => task.id !== deletingTaskId
      ),
    [query.data, sort, deletingTaskId]
  );

  const pendingStatusChange = statusMutation.isPending
    ? statusMutation.variables
    : undefined;

  // A task moves to its new section as soon as its status change is sent.
  const sections = useMemo(
    () =>
      groupTasksByStatus(visibleTasks, (task) =>
        pendingStatusChange?.taskId === task.id
          ? pendingStatusChange.status
          : task.status
      ),
    [visibleTasks, pendingStatusChange]
  );

  const sheetFilterCount = (due === "all" ? 0 : 1) + selectedCategoryIds.length;

  const filtered = Boolean(search || sheetFilterCount);
  const rowError = statusMutation.error ?? deleteMutation.error;

  function clearSearch() {
    setSearch("");
    setSearchDraft("");
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
    clearSearch();
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
    due,
    categories: categoriesQuery.data ?? [],
    categoriesLoading: categoriesQuery.isPending,
    selectedCategoryIds,
    onDueChange: setDue,
    onCategoryToggle: toggleCategory,
    onManageCategories: openCategoryManager,
  };

  const sortMenu = (
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
  );

  const filterButton = (
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
  );

  return (
    // Spacing and header match the calendar mode, so switching modes keeps
    // the header and the controls in place.
    <div className="space-y-6 pb-20 lg:pb-0">
      <DomainPageHeader
        title="Tugas"
        divided={false}
        action={modeSwitch}
        addAction={{
          label: "Tugas baru",
          onClick: () => setNewEditorOpen(true),
        }}
      />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:items-start xl:gap-8">
        <section
          aria-labelledby="task-list-heading"
          className="min-w-0 space-y-4"
        >
          <h2 id="task-list-heading" className="sr-only">
            Daftar tugas
          </h2>
          {/* Below `lg` the search lives in the app bar and the sort and
              filter controls join the result summary row. */}
          <div className="flex gap-2 max-lg:hidden">
            <DomainPageSearch
              label="Cari tugas"
              placeholder="Cari judul atau catatan"
              className="flex-1"
              value={searchDraft}
              onValueChange={setSearchDraft}
              onSubmit={() => setSearch(searchDraft.trim())}
              onClear={clearSearch}
            />
            {sortMenu}
            {filterButton}
          </div>
          <div className="flex min-h-9 items-center gap-3 text-sm text-ink-muted">
            <p className="min-w-0 flex-1 truncate" aria-live="polite">
              {query.isSuccess ? (
                <>
                  <span className="font-semibold text-ink tabular-nums">
                    {visibleTasks.length}
                  </span>{" "}
                  tugas
                  {search ? ` · “${search}”` : null}
                </>
              ) : null}
            </p>
            {filtered ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="min-h-9 shrink-0 px-0 py-0"
                onClick={resetFilters}
              >
                <X /> Hapus filter
              </Button>
            ) : null}
            <div className="flex shrink-0 gap-2 lg:hidden">
              {sortMenu}
              {filterButton}
            </div>
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
              <div className="space-y-6">
                {sections.map((section) => {
                  const Icon = STATUS_ICONS[section.status];
                  const headingId = `task-section-${section.status}`;

                  return (
                    <section
                      key={section.status}
                      aria-labelledby={headingId}
                      className="space-y-2"
                    >
                      <h3
                        id={headingId}
                        className="flex min-h-8 items-center gap-2 px-1 text-xs font-semibold tracking-wide text-ink-muted uppercase"
                      >
                        <Icon aria-hidden="true" className="size-4" />
                        {STATUS_LABELS[section.status]}
                        <span className="min-w-7 rounded-pill bg-surface-1 px-2 py-0.5 text-center font-mono text-xs font-normal text-ink-soft tabular-nums">
                          {section.tasks.length}
                          <span className="sr-only"> tugas</span>
                        </span>
                      </h3>
                      <ul className="space-y-2">
                        {section.tasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            now={now}
                            pendingStatus={
                              pendingStatusChange?.taskId === task.id
                                ? pendingStatusChange.status
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
                    </section>
                  );
                })}
              </div>
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
          <TaskFilterPanel {...filterPanelProps} className="-mx-3 mt-3" />
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
