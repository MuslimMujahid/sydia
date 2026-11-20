import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Plus,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, View } from "react-native";
import { useNow } from "@/components/tasks/use-now";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { CheckCircle, Chip, ChipRow, Divider } from "@/components/ui/controls";
import { FormCard } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import { ErrorState, InlineError, ListSkeleton } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import {
  calendarEventsQueryOptions,
  calendarStatusQueryOptions,
  useRefreshCalendarOnMount,
} from "@/lib/services/api/calendar/calendar.queries";
import {
  tasksQueryOptions,
  useSetTaskStatus,
} from "@/lib/services/api/tasks/tasks.queries";
import { colors, radius, spacing } from "@/lib/theme";
import {
  AGENDA_VIEWS,
  agendaWindow,
  stepAgenda,
  yearMonthDays,
  type AgendaView,
} from "./agenda-window";
import {
  dayKeyInZone,
  formatDayKeyFull,
  formatMonthOfDay,
  formatMonthYear,
  parseDayKey,
  startOfWeek,
  type DayKey,
} from "./calendar-date";
import { seedEventDetail } from "./event-detail-query";
import { KIND_STYLES, syncBadge } from "./kind-style";
import { MonthGrid } from "./month-grid";
import {
  buildAgendaSections,
  buildScheduleItems,
  busyDayKinds,
  groupItemsByDay,
  itemDayTimeLabel,
  taskStatusOf,
  type AgendaSection,
  type ScheduleItem,
} from "./schedule-items";
import { WeekStrip } from "./week-strip";

export function CalendarAgenda() {
  const router = useRouter();
  const { timezone } = useProfile();
  const queryClient = useQueryClient();
  const toast = useToast();
  const showActions = useActionSheet();
  const now = useNow();
  const today = dayKeyInZone(now, timezone);
  const [selectedDay, setSelectedDay] = useState<DayKey>();
  const [view, setView] = useState<AgendaView>("day");
  const [refreshing, setRefreshing] = useState(false);
  const day = selectedDay ?? today;
  const month = parseDayKey(day);
  const window = useMemo(
    () => agendaWindow(view, day, timezone),
    [view, day, timezone]
  );
  const status = useQuery(calendarStatusQueryOptions());
  const events = useQuery(calendarEventsQueryOptions(window.range));
  const tasks = useQuery(tasksQueryOptions());
  const sync = useRefreshCalendarOnMount(status.data?.connected === true);
  const setTaskStatus = useSetTaskStatus();
  const pendingStatus = setTaskStatus.isPending
    ? setTaskStatus.variables
    : undefined;
  const itemsByDay = useMemo(
    () =>
      groupItemsByDay(
        buildScheduleItems(events.data ?? [], tasks.data ?? []),
        window.days,
        timezone
      ),
    [events.data, tasks.data, window.days, timezone]
  );
  const busyDays = useMemo(() => busyDayKinds(itemsByDay), [itemsByDay]);
  const loading = events.isPending || tasks.isPending;
  const error = events.error ?? tasks.error;
  const readyForRows = view !== "year" && Boolean(events.data || tasks.data);
  const sections = readyForRows
    ? buildAgendaSections(
        itemsByDay,
        window.agendaDays,
        view === "week" ? startOfWeek(day) : day,
        today
      )
    : [];

  function openItem(item: ScheduleItem) {
    if (item.kind === "task") {
      router.push({ pathname: "/task/[id]", params: { id: item.task.id } });
      return;
    }
    seedEventDetail(queryClient, item.event);
    router.push({ pathname: "/event/[id]", params: { id: item.event.id } });
  }

  function createItem(anchor = day) {
    showActions({
      title: "Tambahkan ke kalender",
      options: [
        {
          icon: CalendarPlus,
          label: "Acara baru",
          onPress: () =>
            router.push({ pathname: "/event/new", params: { day: anchor } }),
        },
        {
          icon: ListTodo,
          label: "Tugas baru",
          onPress: () =>
            router.push({ pathname: "/task/new", params: { dueDate: anchor } }),
        },
      ],
    });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([events.refetch(), tasks.refetch(), status.refetch()]);
      if (status.data?.connected) sync.mutate(new AbortController().signal);
    } finally {
      setRefreshing(false);
    }
  }

  function renderItem({
    item,
    section,
  }: {
    item: ScheduleItem;
    section: AgendaSection;
  }) {
    const style = KIND_STYLES[item.kind];
    const badge = item.kind === "event" ? syncBadge(item.event) : null;
    const done =
      item.kind === "task" && taskStatusOf(item.task, pendingStatus) === "done";

    return (
      <View style={styles.itemRow}>
        {item.kind === "task" ? (
          <CheckCircle
            checked={done}
            color={style.tint}
            disabled={setTaskStatus.isPending}
            accessibilityLabel={
              done ? `Buka kembali ${item.title}` : `Selesaikan ${item.title}`
            }
            onToggle={() =>
              setTaskStatus.mutate(
                { taskId: item.task.id, status: done ? "inbox" : "done" },
                { onError: (error) => toast(error.message, { tone: "error" }) }
              )
            }
          />
        ) : (
          <View style={[styles.eventWell, { backgroundColor: style.soft }]}>
            <CalendarDays color={style.tint} size={19} />
          </View>
        )}
        <View style={styles.itemContent}>
          <ListRow
            title={item.title}
            subtitle={[
              itemDayTimeLabel(item, section.key, timezone),
              badge?.label,
            ]
              .filter(Boolean)
              .join(" · ")}
            titleLines={2}
            onPress={() => openItem(item)}
          />
        </View>
      </View>
    );
  }

  const calendarNotice =
    status.data?.connectionStatus === "reconnect_required"
      ? "Sambungkan kembali Google Calendar"
      : status.data?.openConflictCount
        ? "Tinjau konflik Google Calendar"
        : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon={Plus}
              accessibilityLabel="Tambahkan ke kalender"
              onPress={() => createItem()}
            />
          ),
        }}
      />
      <SectionList<ScheduleItem, AgendaSection>
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text
              variant="footnote"
              weight="semibold"
              tone={section.isToday ? "accent" : "muted"}
              style={styles.sectionTitle}
              accessibilityRole="header"
            >
              {section.isToday
                ? `Hari ini · ${formatDayKeyFull(section.key)}`
                : formatDayKeyFull(section.key)}
            </Text>
            {section.data.length === 0 && !loading && !error ? (
              <Text style={styles.noItems} tone="muted" variant="callout">
                Jadwal kosong.
              </Text>
            ) : null}
          </View>
        )}
        ItemSeparatorComponent={Divider}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        ListHeaderComponent={
          <>
            <ChipRow style={styles.viewPicker}>
              {AGENDA_VIEWS.map((item) => (
                <Chip
                  key={item.value}
                  label={item.label}
                  selected={view === item.value}
                  onPress={() => setView(item.value)}
                />
              ))}
            </ChipRow>
            {view === "month" ? (
              <View style={styles.todayRow}>
                <Chip
                  label="Hari ini"
                  onPress={() => setSelectedDay(undefined)}
                />
              </View>
            ) : (
              <View style={styles.dateNav}>
                <IconButton
                  icon={ChevronLeft}
                  accessibilityLabel={`${AGENDA_VIEWS.find((item) => item.value === view)?.label} sebelumnya`}
                  onPress={() => setSelectedDay(stepAgenda(view, day, -1))}
                />
                <Text
                  variant="headline"
                  weight="bold"
                  style={styles.monthHeading}
                  accessibilityRole="header"
                >
                  {view === "year" ? String(month.year) : formatMonthOfDay(day)}
                </Text>
                <IconButton
                  icon={ChevronRight}
                  accessibilityLabel={`${AGENDA_VIEWS.find((item) => item.value === view)?.label} berikutnya`}
                  onPress={() => setSelectedDay(stepAgenda(view, day, 1))}
                />
                <Chip
                  label="Hari ini"
                  onPress={() => setSelectedDay(undefined)}
                />
              </View>
            )}
            {view === "day" || view === "week" ? (
              <WeekStrip
                focusDay={day}
                todayKey={today}
                busy={busyDays}
                onSelectDay={setSelectedDay}
                onWeekSwipe={setSelectedDay}
              />
            ) : null}
            {view === "month" ? (
              <MonthGrid
                month={month}
                onMonthChange={(value) =>
                  setSelectedDay(
                    `${value.year}-${String(value.month).padStart(2, "0")}-01`
                  )
                }
                selectedDay={day}
                todayKey={today}
                busy={busyDays}
                onSelectDay={setSelectedDay}
              />
            ) : null}
            {view === "year" ? (
              <YearMonths
                day={day}
                busyDays={busyDays}
                onSelectMonth={(key) => {
                  setSelectedDay(key);
                  setView("month");
                }}
              />
            ) : null}
            <View style={styles.notice}>
              {calendarNotice ? (
                <FormCard>
                  <ListRow
                    title={calendarNotice}
                    onPress={() => router.push("/settings/integrations")}
                  />
                </FormCard>
              ) : null}
              <InlineError
                message={status.error?.message ?? sync.error?.message}
              />
              {error && (events.data || tasks.data) ? (
                <InlineError message={error.message} />
              ) : null}
            </View>
            {loading ? <ListSkeleton rows={3} /> : null}
          </>
        }
        ListEmptyComponent={
          !loading && error && !events.data && !tasks.data ? (
            <ErrorState
              title="Kalender tidak dapat dimuat"
              message={error.message}
              onRetry={() => void refresh()}
            />
          ) : undefined
        }
      />
    </>
  );
}

function YearMonths({
  day,
  busyDays,
  onSelectMonth,
}: {
  day: DayKey;
  busyDays: ReadonlyMap<DayKey, ReadonlySet<ScheduleItem["kind"]>>;
  onSelectMonth: (key: DayKey) => void;
}) {
  const monthly = new Map<string, { events: number; tasks: number }>();
  busyDays.forEach((kinds, key) => {
    const month = key.slice(0, 7);
    const count = monthly.get(month) ?? { events: 0, tasks: 0 };
    if (kinds.has("event")) count.events += 1;
    if (kinds.has("task")) count.tasks += 1;
    monthly.set(month, count);
  });

  return (
    <View style={styles.yearGrid}>
      {yearMonthDays(day).map((key) => {
        const { year, month } = parseDayKey(key);
        const label = formatMonthYear(year, month).split(" ")[0];
        const active = monthly.get(key.slice(0, 7));
        const count = [
          active?.events ? `${active.events} hari beracara` : null,
          active?.tasks ? `${active.tasks} hari bertugas` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <Pressable
            key={key}
            accessibilityLabel={count ? `${label}, ${count}` : label}
            accessibilityRole="button"
            onPress={() => onSelectMonth(key)}
            style={({ pressed }) => [
              styles.yearMonth,
              pressed && styles.pressed,
            ]}
          >
            <Text variant="callout" weight="semibold">
              {label}
            </Text>
            {count ? (
              <Text variant="caption" tone="muted">
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.huge },
  viewPicker: { marginHorizontal: spacing.lg },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md,
  },
  monthHeading: { flex: 1, textAlign: "center" },
  todayRow: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sectionHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sectionTitle: { paddingTop: spacing.sm },
  noItems: { paddingVertical: spacing.md },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.lg,
  },
  itemContent: { flex: 1 },
  eventWell: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  notice: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  yearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  yearMonth: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 56,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  pressed: { backgroundColor: colors.pressed },
});
