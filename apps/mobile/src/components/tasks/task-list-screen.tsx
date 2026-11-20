import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import {
  ArrowUpDown,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  RotateCcw,
  Tags,
  Trash2,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton, Button } from "@/components/ui/button";
import { Chip, ChipRow, Fab } from "@/components/ui/controls";
import { TaskListGlyph } from "@/components/ui/glyphs";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import { categoriesQueryOptions } from "@/lib/services/api/categories/categories.api";
import type {
  Task,
  TaskDueFilter,
  TaskStatus,
} from "@/lib/services/api/tasks/tasks.api";
import {
  tasksQueryOptions,
  useDeleteTask,
  useSetTaskStatus,
} from "@/lib/services/api/tasks/tasks.queries";
import { colors, spacing } from "@/lib/theme";
import { todayKey } from "@/lib/utils/date-time";
import { CategoryIcon } from "./category-icon";
import { TaskRow } from "./task-row";
import {
  COLLAPSIBLE_SECTIONS,
  DUE_FILTERS,
  DUE_LABELS,
  SORT_LABELS,
  TASK_SECTION_LABELS,
  groupTasksBySection,
  sortTasks,
  type TaskSectionKey,
  type TaskSortKey,
} from "./task-view";
import { TryInChat } from "./try-in-chat";
import { useDebouncedValue } from "./use-debounced-value";
import { UNDO_WINDOW_MS, useDelayedDelete } from "./use-delayed-delete";
import { useNow } from "./use-now";

type Section = {
  key: TaskSectionKey;
  count: number;
  collapsed: boolean;
  data: Task[];
};

/** The Tasks tab: filters, sectioned list, swipe actions, and the create FAB. */
export function TaskListScreen() {
  const router = useRouter();
  const profile = useProfile();
  const toast = useToast();
  const showActions = useActionSheet();
  const now = useNow();
  const [due, setDue] = useState<TaskDueFilter | "all">("all");
  const [sort, setSort] = useState<TaskSortKey>("due");
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim());
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<TaskSectionKey>>(
    () => new Set()
  );
  const [refreshing, setRefreshing] = useState(false);

  const categoriesQuery = useQuery(categoriesQueryOptions());
  const categories = categoriesQuery.data;
  const activeCategoryIds = categories
    ? categoryIds.filter((id) =>
        categories.some((category) => category.id === id)
      )
    : categoryIds;
  const query = useQuery(
    tasksQueryOptions({ due, search, categoryIds: activeCategoryIds })
  );
  const statusMutation = useSetTaskStatus();
  const deleteMutation = useDeleteTask();
  const { pendingIds, schedule, undo } = useDelayedDelete(
    (taskId, onSettled) => {
      void deleteMutation
        .mutateAsync(taskId)
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "Tugas tidak dapat dihapus.";
          console.warn(
            "Task deletion failed",
            error instanceof Error ? error.name : "Unknown error"
          );
          toast(message, { tone: "error" });
        })
        .finally(onSettled);
    }
  );

  const filtered =
    Boolean(search) || due !== "all" || activeCategoryIds.length > 0;

  const pendingStatus = statusMutation.isPending
    ? statusMutation.variables
    : undefined;
  const statusOf = (task: Task): TaskStatus =>
    pendingStatus?.taskId === task.id ? pendingStatus.status : task.status;

  const visibleTasks = useMemo(
    () =>
      sortTasks(query.data ?? [], sort).filter(
        (task) => !pendingIds.has(task.id)
      ),
    [query.data, sort, pendingIds]
  );

  const sections: Section[] = groupTasksBySection(visibleTasks, statusOf).map(
    (section) => {
      const collapsed =
        COLLAPSIBLE_SECTIONS.includes(section.key) &&
        !expanded.has(section.key);

      return {
        key: section.key,
        count: section.tasks.length,
        collapsed,
        data: collapsed ? [] : section.tasks,
      };
    }
  );

  function toggleSection(key: TaskSectionKey) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }

  function setStatus(task: Task, status: TaskStatus) {
    if (statusMutation.isPending || statusOf(task) === status) return;
    statusMutation.mutate(
      { taskId: task.id, status },
      { onError: (error) => toast(error.message, { tone: "error" }) }
    );
  }

  function toggle(task: Task) {
    setStatus(task, statusOf(task) === "done" ? "inbox" : "done");
  }

  function deleteWithUndo(task: Task) {
    schedule(task.id);
    toast("Tugas dihapus", {
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: "Urungkan",
        onPress: () => undo(task.id),
      },
    });
  }

  function confirmDelete(task: Task) {
    Alert.alert(
      "Hapus tugas ini?",
      `“${task.title}” akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus tugas",
          style: "destructive",
          onPress: () =>
            deleteMutation.mutate(task.id, {
              onSuccess: () => toast("Tugas dihapus"),
              onError: (error) => toast(error.message, { tone: "error" }),
            }),
        },
      ]
    );
  }

  function openTask(task: Task) {
    router.push({ pathname: "/task/[id]", params: { id: task.id } });
  }

  function openMenu(task: Task) {
    const status = statusOf(task);

    showActions({
      title: task.title,
      options: [
        status === "done"
          ? {
              label: "Tandai belum selesai",
              icon: RotateCcw,
              onPress: () => setStatus(task, "inbox"),
            }
          : {
              label: "Tandai selesai",
              icon: Check,
              onPress: () => setStatus(task, "done"),
            },
        { label: "Ubah", icon: Pencil, onPress: () => openTask(task) },
        status === "cancelled"
          ? {
              label: "Aktifkan lagi",
              icon: RotateCcw,
              onPress: () => setStatus(task, "inbox"),
            }
          : {
              label: "Batalkan tugas",
              icon: Ban,
              onPress: () => setStatus(task, "cancelled"),
            },
        {
          label: "Hapus",
          icon: Trash2,
          destructive: true,
          onPress: () => confirmDelete(task),
        },
      ],
    });
  }

  function openSortMenu() {
    showActions({
      title: "Urutkan tugas",
      options: [
        ...(Object.keys(SORT_LABELS) as TaskSortKey[]).map((value) => ({
          label:
            value === sort ? `✓  ${SORT_LABELS[value]}` : SORT_LABELS[value],
          onPress: () => setSort(value),
        })),
        {
          label: "Kelola kategori",
          icon: Tags,
          onPress: () => router.push("/categories"),
        },
      ],
    });
  }

  function toggleCategory(categoryId: string) {
    setCategoryIds((ids) =>
      ids.includes(categoryId)
        ? ids.filter((id) => id !== categoryId)
        : [...ids, categoryId]
    );
  }

  function resetFilters() {
    setDue("all");
    setCategoryIds([]);
    setSearchDraft("");
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([query.refetch(), categoriesQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  function createTask() {
    router.push({
      pathname: "/task/new",
      params:
        due === "today" ? { dueDate: todayKey(profile.timezone, now) } : {},
    });
  }

  const header = (
    <View style={styles.filters}>
      <ChipRow>
        {DUE_FILTERS.map((value) => (
          <Chip
            key={value}
            label={DUE_LABELS[value]}
            selected={due === value}
            onPress={() => setDue(value)}
            accessibilityLabel={`Tenggat: ${DUE_LABELS[value]}`}
          />
        ))}
      </ChipRow>
      {categories?.length ? (
        <ChipRow>
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={activeCategoryIds.includes(category.id)}
              onPress={() => toggleCategory(category.id)}
              accessibilityLabel={`Kategori ${category.name}`}
              leading={
                <CategoryIcon
                  iconKey={category.iconKey}
                  color={category.color}
                  size={18}
                  round
                />
              }
            />
          ))}
          <Chip
            label="Kelola"
            icon={Tags}
            onPress={() => router.push("/categories")}
          />
        </ChipRow>
      ) : null}
    </View>
  );

  const empty = query.isPending ? (
    <ListSkeleton rows={6} />
  ) : query.isError ? (
    <ErrorState
      title="Tugas tidak dapat dimuat"
      message={query.error.message}
      onRetry={() => void query.refetch()}
    />
  ) : filtered ? (
    <EmptyState
      icon={<TaskListGlyph hue="violet" active />}
      title="Tidak ada tugas yang cocok"
      message="Coba ubah kata kunci pencarian atau longgarkan filternya."
      action={
        <Button
          label="Hapus filter"
          variant="outline"
          size="sm"
          onPress={resetFilters}
        />
      }
    />
  ) : (
    <EmptyState
      icon={<TaskListGlyph hue="violet" active />}
      title="Belum ada tugas"
      message="Tugas dari chat atau tombol + akan muncul di sini."
      action={<TryInChat topic="task" />}
    />
  );

  return (
    <View collapsable={false} style={styles.screen}>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Cari judul atau catatan",
            onChangeText: (event) => setSearchDraft(event.nativeEvent.text),
            onCancelButtonPress: () => setSearchDraft(""),
            tintColor: colors.accent,
          },
          headerRight: () => (
            <IconButton
              icon={ArrowUpDown}
              accessibilityLabel={`Urutkan: ${SORT_LABELS[sort]}`}
              size={36}
              onPress={openSortMenu}
            />
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(task) => task.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.mutedForeground}
            colors={[colors.accent]}
          />
        }
        renderSectionHeader={({ section }) => {
          const collapsible = COLLAPSIBLE_SECTIONS.includes(section.key);
          const Chevron = section.collapsed ? ChevronRight : ChevronDown;
          const label = (
            <>
              <Text variant="footnote" weight="semibold" tone="muted">
                {TASK_SECTION_LABELS[section.key]}
              </Text>
              <View style={styles.count}>
                <Text variant="caption" tone="muted">
                  {section.count}
                </Text>
              </View>
              {collapsible ? (
                <Chevron
                  size={16}
                  color={colors.mutedForeground}
                  strokeWidth={2}
                />
              ) : null}
            </>
          );

          return collapsible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${TASK_SECTION_LABELS[section.key]}, ${section.count} tugas`}
              accessibilityState={{ expanded: !section.collapsed }}
              onPress={() => toggleSection(section.key)}
              style={styles.sectionHeader}
              hitSlop={8}
            >
              {label}
            </Pressable>
          ) : (
            <View style={styles.sectionHeader} accessibilityRole="header">
              {label}
            </View>
          );
        }}
        renderItem={({ item, index, section }) => (
          <TaskRow
            task={item}
            status={statusOf(item)}
            now={now}
            timeZone={profile.timezone}
            first={index === 0}
            last={index === section.data.length - 1}
            onOpen={() => openTask(item)}
            onToggle={() => toggle(item)}
            onDelete={() => deleteWithUndo(item)}
            onMenu={() => openMenu(item)}
          />
        )}
      />
      <Fab accessibilityLabel="Tugas baru" onPress={createTask} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 120, flexGrow: 1 },
  filters: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.muted,
    alignItems: "center",
  },
});
