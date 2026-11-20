import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { spacing } from "@/lib/theme";
import {
  addDays,
  daysBetween,
  startOfWeek,
  WEEKDAY_SHORT_LABELS,
  type DayKey,
} from "./calendar-date";
import { DayCell } from "./day-cell";
import type { ScheduleItemKind } from "./schedule-items";

/** Weeks rendered on each side of the centre week before re-centring. */
const WEEK_SPAN = 52;

interface WeekStripProps {
  /** The highlighted day; its week is the visible page. */
  focusDay: DayKey;
  todayKey: DayKey;
  busy: Map<DayKey, Set<ScheduleItemKind>>;
  onSelectDay: (dayKey: DayKey) => void;
  /** Called when the user swipes to another week. */
  onWeekSwipe: (weekStart: DayKey) => void;
}

/**
 * A swipeable Monday-first week of days, paged one week per screen width,
 * with dots on days that hold events (violet) or tasks (amber).
 */
export function WeekStrip({
  focusDay,
  todayKey,
  busy,
  onSelectDay,
  onWeekSwipe,
}: WeekStripProps) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<DayKey>>(null);
  const focusWeek = startOfWeek(focusDay);
  const [center, setCenter] = useState(focusWeek);

  // Re-centre (and remount the pager) once the focus nears either end.
  const drift = Math.round(daysBetween(center, focusWeek) / 7);
  if (Math.abs(drift) > WEEK_SPAN - 2) setCenter(focusWeek);

  const weeks = useMemo(
    () =>
      Array.from({ length: WEEK_SPAN * 2 + 1 }, (_, index) =>
        addDays(center, (index - WEEK_SPAN) * 7)
      ),
    [center]
  );
  const index = Math.min(Math.max(WEEK_SPAN + drift, 0), weeks.length - 1);

  useEffect(() => {
    listRef.current?.scrollToIndex({ index, animated: true });
  }, [index]);

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    const week = weeks[page];
    if (week && week !== focusWeek) onWeekSwipe(week);
  }

  return (
    <FlatList
      key={`${center}:${width}`}
      ref={listRef}
      data={weeks}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={(week) => week}
      initialScrollIndex={index}
      getItemLayout={(_data, itemIndex) => ({
        length: width,
        offset: width * itemIndex,
        index: itemIndex,
      })}
      initialNumToRender={1}
      maxToRenderPerBatch={3}
      windowSize={3}
      onMomentumScrollEnd={handleMomentumEnd}
      renderItem={({ item: weekStart }) => (
        <View style={[styles.week, { width }]}>
          {WEEKDAY_SHORT_LABELS.map((label, offset) => {
            const dayKey = addDays(weekStart, offset);

            return (
              <DayCell
                key={dayKey}
                dayKey={dayKey}
                weekdayLabel={label}
                selected={dayKey === focusDay}
                isToday={dayKey === todayKey}
                kinds={busy.get(dayKey)}
                onPress={onSelectDay}
              />
            );
          })}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  week: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
  },
});
