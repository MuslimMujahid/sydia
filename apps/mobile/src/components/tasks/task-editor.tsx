import { useQuery } from "@tanstack/react-query";
import { usePreventRemove, useRouter } from "expo-router";
import { Check, MessageSquare, Tags, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { Markdown } from "@/components/markdown/markdown";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Chip, SegmentedControl } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import {
  FormCard,
  FormDivider,
  FormHeader,
  FormScroll,
} from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import { InlineError, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useProfile } from "@/lib/profile";
import { categoriesQueryOptions } from "@/lib/services/api/categories/categories.api";
import {
  useCreateTask,
  useDeleteTask,
  useUpdateTask,
} from "@/lib/services/api/tasks/tasks.queries";
import type { Task, TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import { spacing } from "@/lib/theme";
import { dayKeyInZone } from "@/lib/utils/date-time";
import { CategoryIcon } from "./category-icon";
import {
  dayKeyToPickerDate,
  partsToPickerDate,
  timeOfInstant,
} from "./task-due";
import {
  buildTaskInput,
  buildTaskUpdate,
  isTaskFormDirty,
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
  taskFormValues,
  validateTaskForm,
  type TaskFormValues,
} from "./task-form";
import {
  MAX_TASK_CATEGORIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
} from "./task-view";

const STATUSES: TaskStatus[] = ["inbox", "done", "cancelled"];

interface TaskEditorProps {
  task?: Task;
  initialDueDate?: string;
  onClose: () => void;
}

export function TaskEditor({ task, initialDueDate, onClose }: TaskEditorProps) {
  const router = useRouter();
  const { timezone, locale } = useProfile();
  const showActions = useActionSheet();
  const [initial] = useState(() =>
    taskFormValues(task, timezone, initialDueDate)
  );
  const [values, setValues] = useState(initial);
  const [previewNotes, setPreviewNotes] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const categoriesQuery = useQuery(categoriesQueryOptions());
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const saveMutation = task ? update : create;
  const busy = saveMutation.isPending || remove.isPending;
  const errors = validateTaskForm(values);
  const dirty = isTaskFormDirty(initial, values);
  const allowRemoval = usePreventRemove(
    !leaving && (dirty || busy),
    ({ repeat }) => {
      if (busy) return;
      Alert.alert("Buang perubahan?", "Perubahan tugas belum disimpan.", [
        { text: "Lanjut mengedit", style: "cancel" },
        {
          text: "Buang",
          style: "destructive",
          onPress: () => {
            setLeaving(true);
            repeat();
          },
        },
      ]);
    }
  );

  function change<K extends keyof TaskFormValues>(
    key: K,
    value: TaskFormValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (busy || Object.keys(errors).length) return;
    if (task)
      update.mutate(
        { taskId: task.id, values: buildTaskUpdate(initial, values, timezone) },
        { onSuccess: finish }
      );
    else create.mutate(buildTaskInput(values, timezone), { onSuccess: finish });
  }

  function finish() {
    setLeaving(true);
    allowRemoval();
    onClose();
  }

  function confirmDelete() {
    if (!task || busy) return;
    Alert.alert("Hapus tugas ini?", `“${task.title}” akan dihapus permanen.`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: () => remove.mutate(task.id, { onSuccess: finish }),
      },
    ]);
  }

  function toggleCategory(id: string) {
    const selected = values.categoryIds.includes(id);
    if (!selected && values.categoryIds.length >= MAX_TASK_CATEGORIES) {
      Alert.alert(
        "Maksimal lima kategori",
        "Lepas satu kategori untuk memilih yang lain."
      );
      return;
    }
    change(
      "categoryIds",
      selected
        ? values.categoryIds.filter((item) => item !== id)
        : [...values.categoryIds, id]
    );
  }

  const { due } = values;

  return (
    <>
      <FormHeader
        onCancel={onClose}
        onSave={save}
        canSave={!busy && (!task || dirty) && !Object.keys(errors).length}
        saving={saveMutation.isPending}
      />
      <FormScroll>
        <TextField
          label="Judul"
          placeholder="Apa yang perlu dikerjakan?"
          value={values.title}
          onChangeText={(title) => change("title", title)}
          maxLength={TASK_TITLE_MAX}
          editable={!busy}
        />
        <FormCard>
          <DateTimeField
            label="Tenggat"
            timeZone={timezone}
            locale={locale}
            mode="date"
            value={due ? dayKeyToPickerDate(due.dayKey, timezone) : null}
            onChange={(date) =>
              change("due", {
                dayKey: dayKeyInZone(date, timezone),
                time: due?.time ?? null,
              })
            }
            onClear={due ? () => change("due", null) : undefined}
            disabled={busy}
          />
          {due ? (
            <>
              <FormDivider />
              <DateTimeField
                label="Jam"
                timeZone={timezone}
                locale={locale}
                mode="time"
                placeholder="Tanpa jam"
                value={due.time ? partsToPickerDate(due, timezone) : null}
                onChange={(date) =>
                  change("due", { ...due, time: timeOfInstant(date, timezone) })
                }
                onClear={
                  due.time
                    ? () => change("due", { ...due, time: null })
                    : undefined
                }
                disabled={busy}
              />
            </>
          ) : null}
          {task ? (
            <>
              <FormDivider />
              <ListRow
                title="Status"
                icon={Check}
                value={STATUS_LABELS[values.status]}
                disabled={busy}
                onPress={() =>
                  showActions({
                    title: "Status",
                    options: STATUSES.map((status) => ({
                      label: STATUS_LABELS[status],
                      onPress: () => change("status", status),
                    })),
                  })
                }
              />
            </>
          ) : null}
        </FormCard>
        <View style={{ gap: spacing.sm }}>
          <Text variant="footnote" weight="medium">
            Prioritas
          </Text>
          <SegmentedControl
            value={values.priority}
            options={PRIORITY_ORDER.map((value) => ({
              value,
              label: PRIORITY_LABELS[value],
            }))}
            onChange={(priority) => {
              if (!busy) change("priority", priority);
            }}
          />
        </View>
        <FormCard>
          <ListRow
            title="Kategori"
            icon={Tags}
            subtitle={
              values.categoryIds.length
                ? `${values.categoryIds.length} dipilih`
                : undefined
            }
            value="Kelola"
            onPress={() => router.push("/categories")}
          />
          {categoriesQuery.isPending ? (
            <LoadingState label="Memuat kategori…" />
          ) : null}
          {categoriesQuery.isError ? (
            <ListRow
              title="Muat ulang kategori"
              subtitle={categoriesQuery.error.message}
              onPress={() => void categoriesQuery.refetch()}
            />
          ) : null}
          {categoriesQuery.data?.length ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
                padding: spacing.md,
              }}
            >
              {categoriesQuery.data.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  leading={
                    <CategoryIcon
                      iconKey={category.iconKey}
                      color={category.color}
                      size={20}
                    />
                  }
                  selected={values.categoryIds.includes(category.id)}
                  onPress={busy ? undefined : () => toggleCategory(category.id)}
                />
              ))}
            </View>
          ) : null}
        </FormCard>
        <View style={{ gap: spacing.sm }}>
          {previewNotes ? (
            <Markdown content={values.description} locale={locale} />
          ) : (
            <TextField
              label="Catatan"
              placeholder="Tambahkan catatan"
              value={values.description}
              onChangeText={(description) => change("description", description)}
              multiline
              maxLength={TASK_NOTES_MAX}
              editable={!busy}
              error={errors.description}
            />
          )}
          {values.description.trim() || previewNotes ? (
            <Chip
              label={previewNotes ? "Edit catatan" : "Lihat pratinjau"}
              onPress={() => setPreviewNotes(!previewNotes)}
            />
          ) : null}
        </View>
        {task?.source?.conversationId ? (
          <FormCard>
            <ListRow
              title="Buka percakapan asal"
              icon={MessageSquare}
              onPress={() => {
                const id = task.source?.conversationId;
                if (id) router.push({ pathname: "/chat/[id]", params: { id } });
              }}
            />
          </FormCard>
        ) : null}
        <InlineError
          message={saveMutation.error?.message ?? remove.error?.message}
        />
        {task ? (
          <FormCard>
            <ListRow
              title="Hapus tugas"
              icon={Trash2}
              destructive
              disabled={busy}
              onPress={confirmDelete}
            />
          </FormCard>
        ) : null}
      </FormScroll>
    </>
  );
}
