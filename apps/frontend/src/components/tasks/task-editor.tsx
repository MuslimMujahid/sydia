import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import { DomainListSkeleton } from "@/components/domain/domain-page";
import {
  FieldShell,
  FormError,
  SelectField,
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
import type { Category } from "@/lib/services/api/categories/categories.api";
import { categoriesQueryOptions } from "@/lib/services/api/categories/categories.queries";
import type {
  CreateTaskInput,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/services/api/tasks/tasks.api";
import {
  taskQueryOptions,
  useCreateTask,
  useDeleteTask,
  useUpdateTask,
} from "@/lib/services/api/tasks/tasks.queries";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils/date-time";
import { CategoryIcon } from "./category-icon";
import { PRIORITY_LABELS, STATUS_LABELS } from "./task-view";

// Task dialogs are bottom sheets on phones and roomy centered dialogs from `sm`.
export const TASK_SHEET_CLASS =
  "sm:max-h-[90dvh] sm:max-w-xl sm:overflow-y-auto";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Masukkan judul tugas."),
  description: z.string(),
  status: z.enum(["inbox", "doing", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]),
  dueAt: z.string(),
  categoryIds: z.array(z.string()).max(5, "Pilih maksimal 5 kategori."),
});

function taskValues(task?: Task, initialDueAt?: string) {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? ("inbox" as const),
    priority: task?.priority ?? ("medium" as const),
    dueAt: task ? toDateTimeLocal(task.dueAt) : (initialDueAt ?? ""),
    categoryIds: task?.categories.map((category) => category.id) ?? [],
  };
}

type CategoryPickerProps = {
  categories: Category[];
  selected: string[];
  loading: boolean;
  onChange: (value: string[]) => void;
};

function CategoryPicker({
  categories,
  selected,
  loading,
  onChange,
}: CategoryPickerProps) {
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

export type TaskEditorProps = {
  task?: Task;
  /** Wall-time "yyyy-MM-ddTHH:mm" due prefill for a new task. */
  initialDueAt?: string;
  /** Content above the title, such as the event/task switch. */
  header?: ReactNode;
  onClose: () => void;
};

export function TaskEditor({
  task,
  initialDueAt,
  header,
  onClose,
}: TaskEditorProps) {
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const categoriesQuery = useQuery(categoriesQueryOptions());
  const mutation = task ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: taskValues(task, initialDueAt),
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
      {header}
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

type TaskEditorLoaderProps = {
  taskId: string;
  onClose: () => void;
};

/** Loads a task by id, then shows its editor. */
export function TaskEditorLoader({ taskId, onClose }: TaskEditorLoaderProps) {
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
