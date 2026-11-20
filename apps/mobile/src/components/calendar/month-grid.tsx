import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";
import {
  formatMonthYear,
  getMonthGridDays,
  WEEKDAY_SHORT_LABELS,
  type DayKey,
} from "./calendar-date";
import { DayCell } from "./day-cell";
import type { ScheduleItemKind } from "./schedule-items";

export type MonthAnchor = { year: number; month: number };

export function shiftMonth(anchor: MonthAnchor, delta: number): MonthAnchor {
  const date = new Date(Date.UTC(anchor.year, anchor.month - 1 + delta, 1));

  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

interface MonthGridProps {
  month: MonthAnchor;
  onMonthChange: (month: MonthAnchor) => void;
  selectedDay: DayKey;
  todayKey: DayKey;
  busy: Map<DayKey, Set<ScheduleItemKind>>;
  onSelectDay: (dayKey: DayKey) => void;
}

/** A compact month calendar for jumping to any date. */
export function MonthGrid({
  month,
  onMonthChange,
  selectedDay,
  todayKey,
  busy,
  onSelectDay,
}: MonthGridProps) {
  const days = getMonthGridDays(month.year, month.month);
  const weeks = Array.from({ length: days.length / 7 }, (_, week) =>
    days.slice(week * 7, week * 7 + 7)
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Bulan sebelumnya"
          size={36}
          onPress={() => onMonthChange(shiftMonth(month, -1))}
        />
        <Text variant="callout" weight="semibold" accessibilityRole="header">
          {formatMonthYear(month.year, month.month)}
        </Text>
        <IconButton
          icon={ChevronRight}
          accessibilityLabel="Bulan berikutnya"
          size={36}
          onPress={() => onMonthChange(shiftMonth(month, 1))}
        />
      </View>
      <View style={styles.row}>
        {WEEKDAY_SHORT_LABELS.map((label) => (
          <Text
            key={label}
            variant="caption"
            tone="muted"
            align="center"
            style={styles.weekday}
          >
            {label}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]?.key} style={styles.row}>
          {week.map((day) => (
            <DayCell
              key={day.key}
              dayKey={day.key}
              selected={day.key === selectedDay}
              isToday={day.key === todayKey}
              muted={!day.inMonth}
              kinds={busy.get(day.key)}
              onPress={onSelectDay}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
  },
  row: { flexDirection: "row" },
  weekday: { flex: 1, paddingVertical: spacing.xs },
});
