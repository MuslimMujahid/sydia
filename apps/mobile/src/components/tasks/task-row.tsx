import { CalendarClock, Check, RotateCcw, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { CheckCircle } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";
import type { Task, TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import { colors, radius, spacing } from "@/lib/theme";
import { CategoryIcon } from "./category-icon";
import { PriorityFlag } from "./priority-flag";
import { SwipeRow } from "./swipe-row";
import { formatTaskDue, formatTaskDueLong } from "./task-due";
import { PRIORITY_LABELS, isTaskOverdue } from "./task-view";

const VISIBLE_CATEGORY_LIMIT = 2;

export interface TaskRowProps {
  task: Task;
  /** The status shown, including an optimistic change in flight. */
  status: TaskStatus;
  now: Date;
  timeZone: string;
  /** Position inside its section card, for the rounded corners. */
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMenu: () => void;
}

/**
 * One task on its section card: completion circle, title, due date, and
 * categories. Swipe right to complete or reopen, swipe left to delete, long
 * press for the full menu.
 */
export function TaskRow({
  task,
  status,
  now,
  timeZone,
  first,
  last,
  onOpen,
  onToggle,
  onDelete,
  onMenu,
}: TaskRowProps) {
  const done = status === "done";
  const finished = done || status === "cancelled";
  const overdue = isTaskOverdue({ dueAt: task.dueAt, status }, now);
  const dueLabel = task.dueAt ? formatTaskDue(task.dueAt, timeZone, now) : null;
  const visibleCategories = task.categories.slice(0, VISIBLE_CATEGORY_LIMIT);
  const hiddenCategoryCount = task.categories.length - visibleCategories.length;
  // Medium is the default, so only a deliberate high or low priority shows.
  const showFlag = task.priority !== "medium";

  const accessibilityLabel = [
    task.title,
    done ? "selesai" : status === "cancelled" ? "dibatalkan" : null,
    task.dueAt
      ? `tenggat ${formatTaskDueLong(task.dueAt, timeZone)}${overdue ? ", terlambat" : ""}`
      : null,
    `prioritas ${PRIORITY_LABELS[task.priority].toLowerCase()}`,
    task.categories.length
      ? `kategori ${task.categories.map((category) => category.name).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SwipeRow
      containerStyle={[
        styles.container,
        first && styles.first,
        last && styles.last,
      ]}
      left={{
        label: done ? "Buka lagi" : "Selesai",
        icon: done ? RotateCcw : Check,
        color: done ? colors.mutedForeground : colors.primary,
        onTrigger: onToggle,
      }}
      right={{
        label: "Hapus",
        icon: Trash2,
        color: colors.destructive,
        onTrigger: onDelete,
      }}
    >
      <View style={styles.row}>
        <View style={styles.check}>
          <CheckCircle
            checked={done}
            onToggle={onToggle}
            accessibilityLabel={
              done
                ? `Tandai “${task.title}” belum selesai`
                : `Tandai “${task.title}” selesai`
            }
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Buka rincian tugas"
          accessibilityActions={[
            { name: "activate", label: "Buka tugas" },
            {
              name: "toggle",
              label: done ? "Tandai belum selesai" : "Tandai selesai",
            },
            { name: "delete", label: "Hapus tugas" },
            { name: "longpress", label: "Menu tugas" },
          ]}
          onAccessibilityAction={(event) => {
            const action = event.nativeEvent.actionName;
            if (action === "toggle") onToggle();
            else if (action === "delete") onDelete();
            else if (action === "longpress") onMenu();
            else onOpen();
          }}
          onPress={onOpen}
          onLongPress={onMenu}
          delayLongPress={350}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        >
          <View style={styles.titleRow}>
            <Text
              variant="body"
              weight="medium"
              numberOfLines={2}
              style={[styles.title, finished && styles.finishedTitle]}
            >
              {task.title}
            </Text>
            {showFlag ? (
              <View style={styles.flag}>
                <PriorityFlag
                  priority={task.priority}
                  size={16}
                  muted={finished}
                />
              </View>
            ) : null}
          </View>
          {dueLabel || task.categories.length ? (
            <View style={styles.meta}>
              {dueLabel ? (
                <View style={styles.due}>
                  <CalendarClock
                    size={13}
                    strokeWidth={2}
                    color={
                      overdue
                        ? colors.destructive
                        : finished
                          ? colors.input
                          : colors.mutedForeground
                    }
                  />
                  <Text
                    variant="footnote"
                    weight={overdue ? "semibold" : "regular"}
                    tone={overdue ? "destructive" : "muted"}
                    style={finished && styles.finishedMeta}
                    numberOfLines={1}
                  >
                    {dueLabel}
                  </Text>
                </View>
              ) : null}
              {visibleCategories.map((category) => (
                <View
                  key={category.id}
                  style={[styles.category, finished && styles.finishedMeta]}
                >
                  <CategoryIcon
                    iconKey={category.iconKey}
                    color={category.color}
                    size={16}
                    round
                  />
                  <Text
                    variant="caption"
                    tone="muted"
                    numberOfLines={1}
                    style={styles.categoryName}
                  >
                    {category.name}
                  </Text>
                </View>
              ))}
              {hiddenCategoryCount > 0 ? (
                <View style={[styles.category, styles.more]}>
                  <Text variant="caption" tone="muted">
                    +{hiddenCategoryCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
        {!last ? <View style={styles.separator} /> : null}
      </View>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.cardBorder,
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.card,
    minHeight: 56,
  },
  check: { paddingLeft: spacing.lg, paddingTop: spacing.lg },
  body: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    gap: spacing.xs,
    minHeight: 56,
    justifyContent: "center",
  },
  pressed: { backgroundColor: colors.pressed },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1 },
  finishedTitle: {
    color: colors.mutedForeground,
    textDecorationLine: "line-through",
  },
  flag: { paddingTop: 3 },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  due: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  category: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 140,
    paddingRight: spacing.sm,
    paddingLeft: 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  categoryName: { flexShrink: 1 },
  more: { paddingLeft: spacing.sm },
  finishedMeta: { opacity: 0.55 },
  separator: {
    position: "absolute",
    left: spacing.lg + 24 + spacing.md,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
