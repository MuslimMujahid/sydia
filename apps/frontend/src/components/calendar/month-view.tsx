import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  formatDayKeyLabel,
  formatMonthYear,
  getMonthGridDays,
  parseDayKey,
  WEEKDAY_LONG_LABELS,
  WEEKDAY_SHORT_LABELS,
  type DayKey,
  type MonthGridDay,
} from "./calendar-date";
import { ItemChip, KIND_STYLES } from "./calendar-item";
import { isAllDayOn, type ScheduleItem } from "./schedule-items";

/** Entries per cell until the grid has been measured. */
const DEFAULT_ENTRY_SLOTS = 3;
const MAX_MOBILE_MARKERS = 3;
/** Space a cell's day number takes above its entries, in px. */
const CELL_HEADER_PX = 40;
/** One entry row (chip plus gap), in px. */
const ENTRY_ROW_PX = 22;

export type MonthViewProps = {
  anchor: DayKey;
  todayKey: DayKey;
  timeZone: string;
  itemsByDay: Record<DayKey, ScheduleItem[]>;
  isDone: (item: ScheduleItem) => boolean;
  onSelectDay: (dayKey: DayKey) => void;
  onOpenDay: (dayKey: DayKey) => void;
  onEditItem: (item: ScheduleItem) => void;
  onCreateForDay: (dayKey: DayKey) => void;
};

type DayCellProps = {
  day: MonthGridDay;
  items: ScheduleItem[];
  timeZone: string;
  isToday: boolean;
  isSelected: boolean;
  /** Entry rows that fit in the cell, including a "+N lainnya" row. */
  entrySlots: number;
  isDone: (item: ScheduleItem) => boolean;
  onSelectDay: (dayKey: DayKey) => void;
  onOpenDay: (dayKey: DayKey) => void;
  onEditItem: (item: ScheduleItem) => void;
  onCreateForDay: (dayKey: DayKey) => void;
};

function countLabel(items: ScheduleItem[]): string {
  const events = items.filter((item) => item.kind === "event").length;
  const tasks = items.length - events;
  const parts = [
    events ? `${events} acara` : "",
    tasks ? `${tasks} tugas` : "",
  ].filter(Boolean);

  return parts.length ? `, ${parts.join(", ")}` : "";
}

function DayCell({
  day,
  items,
  timeZone,
  isToday,
  isSelected,
  entrySlots,
  isDone,
  onSelectDay,
  onOpenDay,
  onEditItem,
  onCreateForDay,
}: DayCellProps) {
  // All-day and multi-day events lead the cell, as bars.
  const ordered = useMemo(() => {
    const allDay = items.filter((item) => isAllDayOn(item, day.key, timeZone));
    const timed = items.filter((item) => !allDay.includes(item));

    return [
      ...allDay.map((item) => ({ item, allDay: true })),
      ...timed.map((item) => ({ item, allDay: false })),
    ];
  }, [items, day.key, timeZone]);

  // Show everything that fits; otherwise keep the last row for "+N lainnya".
  const visibleCount =
    ordered.length <= entrySlots ? ordered.length : Math.max(entrySlots - 1, 1);

  const overflow = ordered.length - visibleCount;
  const dayLabel = formatDayKeyLabel(day.key);

  return (
    <div
      role="gridcell"
      aria-selected={isSelected}
      aria-current={isToday ? "date" : undefined}
      className={cn(
        "group relative flex min-h-14 min-w-0 flex-col border-r border-b border-hairline p-1 transition-colors sm:min-h-30 sm:p-1.5 lg:min-h-24",
        !day.inMonth && "bg-surface-1/50",
        isSelected ? "max-sm:bg-brand/8" : "hover:bg-surface-1/40"
      )}
    >
      <button
        type="button"
        aria-label={`${dayLabel}${countLabel(items)}${isToday ? ", hari ini" : ""}`}
        className="flex flex-col items-center gap-1 self-center rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-brand/50 sm:self-start"
        onClick={() => onSelectDay(day.key)}
      >
        <span
          className={cn(
            "grid size-6 place-items-center rounded-pill font-display text-xs font-semibold tabular-nums sm:size-7 sm:text-sm",
            isToday
              ? "bg-brand text-ink"
              : day.inMonth
                ? "text-ink hover:bg-surface-1"
                : "text-ink-muted/70 hover:bg-surface-1",
            isSelected && !isToday && "max-sm:ring-2 max-sm:ring-brand/60"
          )}
        >
          {day.day}
        </span>
        {items.length ? (
          <span
            className="flex items-center gap-1 sm:hidden"
            aria-hidden="true"
          >
            {items.slice(0, MAX_MOBILE_MARKERS).map((item) => (
              <span
                key={item.key}
                className={cn(
                  "size-1.5 rounded-pill",
                  KIND_STYLES[item.kind].dotClass,
                  isDone(item) && "opacity-40"
                )}
              />
            ))}
            {items.length > MAX_MOBILE_MARKERS ? (
              <span className="font-mono text-[10px] leading-none text-ink-muted">
                +{items.length - MAX_MOBILE_MARKERS}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      <ul className="mt-1 hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
        {ordered.slice(0, visibleCount).map(({ item, allDay }) => (
          <li key={item.key} className="min-w-0">
            <ItemChip
              item={item}
              timeZone={timeZone}
              allDay={allDay}
              done={isDone(item)}
              onEdit={() => onEditItem(item)}
            />
          </li>
        ))}
        {overflow > 0 ? (
          <li>
            <button
              type="button"
              className="w-full rounded-sm px-1.5 py-0.5 text-left text-xs font-medium text-ink-muted outline-none hover:bg-surface-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50"
              aria-label={`Lihat ${overflow} item lainnya pada ${dayLabel}`}
              onClick={() => onOpenDay(day.key)}
            >
              +{overflow} lainnya
            </button>
          </li>
        ) : null}
      </ul>
      <button
        type="button"
        aria-label={`Buat pada ${dayLabel}`}
        className="absolute top-1.5 right-1.5 hidden size-6 place-items-center rounded-pill text-ink-muted opacity-0 transition-opacity outline-none hover:bg-surface-1 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand/50 sm:grid sm:group-hover:opacity-100"
        onClick={() => onCreateForDay(day.key)}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function MonthView({
  anchor,
  todayKey,
  timeZone,
  itemsByDay,
  isDone,
  onSelectDay,
  onOpenDay,
  onEditItem,
  onCreateForDay,
}: MonthViewProps) {
  const { year, month } = parseDayKey(anchor);
  const weeks = useMemo(() => {
    const days = getMonthGridDays(year, month);
    const chunks: MonthGridDay[][] = [];
    for (let index = 0; index < days.length; index += 7)
      chunks.push(days.slice(index, index + 7));

    return chunks;
  }, [year, month]);

  // Rows stretch to fill the panel from `lg`, so the number of entries a cell
  // can show follows the measured row height.
  const weeksRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const weekCount = weeks.length;

  useEffect(() => {
    const element = weeksRef.current;
    if (!element) return;
    const measure = () => setRowHeight(element.clientHeight / weekCount);
    const observer = new ResizeObserver(measure);

    observer.observe(element);
    measure();

    return () => observer.disconnect();
  }, [weekCount]);

  const entrySlots = rowHeight
    ? Math.max(Math.floor((rowHeight - CELL_HEADER_PX) / ENTRY_ROW_PX), 1)
    : DEFAULT_ENTRY_SLOTS;

  return (
    <div
      role="grid"
      aria-label={formatMonthYear(year, month)}
      className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-card lg:flex lg:h-full lg:flex-col"
    >
      <div role="row" className="grid grid-cols-7 border-b border-hairline">
        {WEEKDAY_SHORT_LABELS.map((label, index) => (
          <div
            key={label}
            role="columnheader"
            aria-label={WEEKDAY_LONG_LABELS[index] ?? label}
            className="py-2 text-center font-mono text-[11px] tracking-wider text-ink-muted uppercase"
          >
            <span aria-hidden="true">{label}</span>
          </div>
        ))}
      </div>
      {/* The last column's and row's outer borders come from the frame. */}
      <div
        ref={weeksRef}
        className="-mr-px -mb-px grid grid-cols-7 lg:min-h-0 lg:flex-1 lg:auto-rows-fr"
      >
        {weeks.map((week) => (
          <div
            role="row"
            key={week[0]?.key ?? `week-${week.length}`}
            className="contents"
          >
            {week.map((day) => (
              <DayCell
                key={day.key}
                day={day}
                items={itemsByDay[day.key] ?? []}
                timeZone={timeZone}
                isToday={day.key === todayKey}
                isSelected={day.key === anchor}
                entrySlots={entrySlots}
                isDone={isDone}
                onSelectDay={onSelectDay}
                onOpenDay={onOpenDay}
                onEditItem={onEditItem}
                onCreateForDay={onCreateForDay}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
