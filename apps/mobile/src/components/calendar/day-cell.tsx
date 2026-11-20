import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/theme";
import { formatDayKeyLabel, parseDayKey, type DayKey } from "./calendar-date";
import { KIND_STYLES } from "./kind-style";
import type { ScheduleItemKind } from "./schedule-items";

interface DayCellProps {
  dayKey: DayKey;
  selected: boolean;
  isToday: boolean;
  /** Out-of-month days in the month grid read quieter. */
  muted?: boolean;
  kinds?: Set<ScheduleItemKind>;
  /** Weekday label above the number (week strip only). */
  weekdayLabel?: string;
  onPress: (dayKey: DayKey) => void;
}

/** One tappable day: number in a circle plus event/task dots beneath. */
export function DayCell({
  dayKey,
  selected,
  isToday,
  muted = false,
  kinds,
  weekdayLabel,
  onPress,
}: DayCellProps) {
  const numberColor = selected
    ? colors.primaryForeground
    : isToday
      ? colors.accent
      : muted
        ? colors.mutedForeground
        : colors.foreground;
  const busy = kinds && kinds.size > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDayKeyLabel(dayKey)}${isToday ? ", hari ini" : ""}${busy ? ", ada jadwal" : ""}`}
      accessibilityState={{ selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress(dayKey);
      }}
      style={styles.cell}
    >
      {weekdayLabel ? (
        <Text
          variant="caption"
          weight="medium"
          tone={isToday && !selected ? "accent" : "muted"}
        >
          {weekdayLabel}
        </Text>
      ) : null}
      <View
        style={[
          styles.circle,
          selected && styles.selected,
          isToday && !selected && styles.today,
        ]}
      >
        <Text
          variant="callout"
          weight={selected || isToday ? "bold" : "medium"}
          color={numberColor}
        >
          {parseDayKey(dayKey).day}
        </Text>
      </View>
      <View style={styles.dots}>
        {(["event", "task"] as const).map((kind) =>
          kinds?.has(kind) ? (
            <View
              key={kind}
              style={[styles.dot, { backgroundColor: KIND_STYLES[kind].dot }]}
            />
          ) : null
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.primary },
  today: { backgroundColor: colors.accentSoft },
  dots: { flexDirection: "row", gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
