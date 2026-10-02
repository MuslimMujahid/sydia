import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils/cn";
import {
  formatDayKeyLabel,
  formatHourLabel,
  formatWeekdayShort,
  formatZoneOffset,
  MINUTES_PER_DAY,
  minutesOfDayInZone,
  parseDayKey,
  type DayKey,
} from "./calendar-date";
import { ItemBlock, ItemChip } from "./calendar-item";
import {
  cascadeBox,
  isAllDayOn,
  layoutTimedItems,
  type ScheduleItem,
} from "./schedule-items";

/** Height of one hour row, in rem (48px). */
const HOUR_REM = 3;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** New items created by clicking the grid snap to half hours. */
const SNAP_MINUTES = 30;
/** Blocks shorter than this fit only one line of text. */
const TWO_LINE_MINUTES = 50;
/** Scroll here when today is not in view: the start of a working day. */
const DEFAULT_SCROLL_HOUR = 7;

function remFor(minutes: number): string {
  return `${(minutes / 60) * HOUR_REM}rem`;
}

export type TimeGridViewProps = {
  days: DayKey[];
  todayKey: DayKey;
  now: Date;
  timeZone: string;
  itemsByDay: Record<DayKey, ScheduleItem[]>;
  isDone: (item: ScheduleItem) => boolean;
  onOpenDay: (dayKey: DayKey) => void;
  onEditItem: (item: ScheduleItem) => void;
  onDeleteItem: (item: ScheduleItem) => void;
  onCreateAt: (dayKey: DayKey, minute: number) => void;
};

type DayColumnProps = {
  dayKey: DayKey;
  items: ScheduleItem[];
  timeZone: string;
  nowMinute: number | null;
  isDone: (item: ScheduleItem) => boolean;
  onEditItem: (item: ScheduleItem) => void;
  onDeleteItem: (item: ScheduleItem) => void;
  onCreateAt: (dayKey: DayKey, minute: number) => void;
};

function DayColumn({
  dayKey,
  items,
  timeZone,
  nowMinute,
  isDone,
  onEditItem,
  onDeleteItem,
  onCreateAt,
}: DayColumnProps) {
  const positioned = useMemo(
    () => layoutTimedItems(items, dayKey, timeZone),
    [items, dayKey, timeZone]
  );

  // Clicking empty grid space starts a new item at that time. Keyboard users
  // create items with the page's create button.
  function handleBackgroundClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - bounds.top) / bounds.height;
    const minute =
      Math.floor((ratio * MINUTES_PER_DAY) / SNAP_MINUTES) * SNAP_MINUTES;

    onCreateAt(
      dayKey,
      Math.min(Math.max(minute, 0), MINUTES_PER_DAY - SNAP_MINUTES)
    );
  }

  return (
    <div
      role="presentation"
      className="relative min-w-0 cursor-cell border-l border-hairline"
      style={{ height: remFor(MINUTES_PER_DAY) }}
      onClick={handleBackgroundClick}
    >
      {HOURS.slice(1).map((hour) => (
        <div
          key={hour}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-hairline"
          style={{ top: remFor(hour * 60) }}
        />
      ))}
      <ul aria-label={`Jadwal ${formatDayKeyLabel(dayKey)}`}>
        {positioned.map((entry) => {
          const box = cascadeBox(entry.column, entry.columns);

          return (
            <li
              key={entry.item.key}
              className="absolute pr-1 pb-px"
              style={{
                top: remFor(entry.startMinute),
                height: remFor(entry.endMinute - entry.startMinute),
                left: `${box.left}%`,
                width: `${box.width}%`,
                // Later cards in a cluster sit on top of earlier ones.
                zIndex: entry.column + 1,
              }}
            >
              <ItemBlock
                item={entry.item}
                timeZone={timeZone}
                done={isDone(entry.item)}
                compact={entry.endMinute - entry.startMinute < TWO_LINE_MINUTES}
                onEdit={() => onEditItem(entry.item)}
                onDelete={() => onDeleteItem(entry.item)}
              />
            </li>
          );
        })}
      </ul>
      {nowMinute !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-40 border-t-2 border-brand"
          style={{ top: remFor(nowMinute) }}
        >
          <span className="absolute -top-[5px] -left-[5px] size-2 rounded-pill bg-brand" />
        </div>
      ) : null}
    </div>
  );
}

/** Hourly grid for the day and week views. */
export function TimeGridView({
  days,
  todayKey,
  now,
  timeZone,
  itemsByDay,
  isDone,
  onOpenDay,
  onEditItem,
  onDeleteItem,
  onCreateAt,
}: TimeGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowMinute = minutesOfDayInZone(now, timeZone);
  // Open on the current hour for today, or the start of the working day.
  // Captured once; the parent remounts the grid when the visible days change,
  // so live clock updates never yank the scroll position.
  const [initialScrollHour] = useState(() =>
    days.includes(todayKey)
      ? Math.max(Math.floor(nowMinute / 60) - 1, 0)
      : DEFAULT_SCROLL_HOUR
  );

  const split = useMemo(() => {
    const allDay: Record<DayKey, ScheduleItem[]> = {};
    const timed: Record<DayKey, ScheduleItem[]> = {};

    for (const key of days)
      for (const item of itemsByDay[key] ?? []) {
        const target = isAllDayOn(item, key, timeZone) ? allDay : timed;
        (target[key] ??= []).push(item);
      }

    return { allDay, timed };
  }, [days, itemsByDay, timeZone]);

  const hasAllDay = Object.keys(split.allDay).length > 0;
  const columns = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller)
      scroller.scrollTop = (scroller.scrollHeight / 24) * initialScrollHour;
  }, [initialScrollHour]);

  // The body scrolls vertically; reserving the same scrollbar gutter on the
  // header rows keeps their columns aligned with the body's.
  const gutterClass = "overflow-y-hidden [scrollbar-gutter:stable]";

  return (
    // From `lg` the grid fills its slot and only the hours scroll.
    <div className="overflow-hidden rounded-lg bg-canvas lg:flex lg:h-full lg:flex-col">
      <div className="overflow-x-auto lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div
          className={cn(
            "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
            days.length > 1 && "min-w-[36rem]"
          )}
        >
          <div
            className={cn("grid border-b border-hairline", gutterClass)}
            style={{ gridTemplateColumns: columns }}
          >
            <div className="flex items-end justify-end px-2 pb-2 font-mono text-[10px] text-ink-muted">
              {formatZoneOffset(timeZone, now)}
            </div>
            {days.map((key) => {
              const isToday = key === todayKey;

              return (
                <div key={key} className="min-w-0 px-1 py-2 text-center">
                  <button
                    type="button"
                    aria-label={`Buka ${formatDayKeyLabel(key)}${isToday ? ", hari ini" : ""}`}
                    aria-current={isToday ? "date" : undefined}
                    className="mx-auto flex flex-col items-center gap-0.5 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-brand/50"
                    onClick={() => onOpenDay(key)}
                  >
                    <span className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">
                      {formatWeekdayShort(key)}
                    </span>
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-pill font-display text-lg font-semibold tabular-nums",
                        isToday ? "bg-brand text-ink" : "hover:bg-surface-1"
                      )}
                    >
                      {parseDayKey(key).day}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {hasAllDay ? (
            <div
              className={cn("grid border-b border-hairline", gutterClass)}
              style={{ gridTemplateColumns: columns }}
            >
              <div className="px-2 py-1.5 text-right text-[10px] leading-tight font-medium text-ink-muted">
                Sepanjang hari
              </div>
              {days.map((key) => (
                <ul
                  key={key}
                  aria-label={`Sepanjang hari, ${formatDayKeyLabel(key)}`}
                  className="min-w-0 space-y-0.5 border-l border-hairline p-1"
                >
                  {(split.allDay[key] ?? []).map((item) => (
                    <li key={item.key}>
                      <ItemChip
                        item={item}
                        timeZone={timeZone}
                        onEdit={() => onEditItem(item)}
                        onDelete={() => onDeleteItem(item)}
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ) : null}
          <div
            ref={scrollRef}
            className="max-h-[min(70dvh,42rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] lg:max-h-none lg:min-h-0 lg:flex-1"
          >
            <div className="grid" style={{ gridTemplateColumns: columns }}>
              <div
                aria-hidden="true"
                className="relative"
                style={{ height: remFor(MINUTES_PER_DAY) }}
              >
                {HOURS.slice(1).map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-ink-muted"
                    style={{ top: remFor(hour * 60) }}
                  >
                    {formatHourLabel(hour)}
                  </span>
                ))}
              </div>
              {days.map((key) => (
                <DayColumn
                  key={key}
                  dayKey={key}
                  items={split.timed[key] ?? []}
                  timeZone={timeZone}
                  nowMinute={key === todayKey ? nowMinute : null}
                  isDone={isDone}
                  onEditItem={onEditItem}
                  onDeleteItem={onDeleteItem}
                  onCreateAt={onCreateAt}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
