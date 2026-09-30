import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import {
  dayKeyOf,
  formatDayKeyLabel,
  formatMonthName,
  getMonthGridDays,
  parseDayKey,
  WEEKDAY_LONG_LABELS,
  WEEKDAY_SHORT_LABELS,
  type DayKey,
  type MonthGridDay,
} from "./calendar-date";
import { KIND_STYLES } from "./calendar-item";
import type { ScheduleItem } from "./schedule-items";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export type YearViewProps = {
  anchor: DayKey;
  todayKey: DayKey;
  itemsByDay: Record<DayKey, ScheduleItem[]>;
  onOpenDay: (dayKey: DayKey) => void;
  onOpenMonth: (dayKey: DayKey) => void;
};

type MiniMonthProps = {
  year: number;
  month: number;
  todayKey: DayKey;
  itemsByDay: Record<DayKey, ScheduleItem[]>;
  onOpenDay: (dayKey: DayKey) => void;
  onOpenMonth: (dayKey: DayKey) => void;
};

function dayCounts(items: ScheduleItem[] | undefined) {
  const events = items?.filter((item) => item.kind === "event").length ?? 0;

  return { events, tasks: (items?.length ?? 0) - events };
}

function MiniMonth({
  year,
  month,
  todayKey,
  itemsByDay,
  onOpenDay,
  onOpenMonth,
}: MiniMonthProps) {
  const weeks = useMemo(() => {
    const days = getMonthGridDays(year, month);
    const chunks: MonthGridDay[][] = [];
    for (let index = 0; index < days.length; index += 7)
      chunks.push(days.slice(index, index + 7));

    return chunks;
  }, [year, month]);

  const monthName = formatMonthName(month);
  const headingId = `year-month-${year}-${month}`;

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="px-1">
        <button
          type="button"
          className="rounded-sm font-display text-sm font-semibold capitalize outline-none hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand/50"
          onClick={() => onOpenMonth(dayKeyOf({ year, month, day: 1 }))}
        >
          {monthName}
        </button>
      </h3>
      <div role="grid" aria-labelledby={headingId} className="mt-2">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_SHORT_LABELS.map((label, index) => (
            <div
              key={label}
              role="columnheader"
              aria-label={WEEKDAY_LONG_LABELS[index] ?? label}
              className="pb-1 text-center font-mono text-[10px] text-ink-muted uppercase"
            >
              <span aria-hidden="true">{label.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div
            role="row"
            key={week[0]?.key ?? "week"}
            className="grid grid-cols-7 py-px"
          >
            {week.map((day) => {
              if (!day.inMonth)
                return <div key={day.key} role="gridcell" aria-hidden="true" />;
              const isToday = day.key === todayKey;
              const { events, tasks } = dayCounts(itemsByDay[day.key]);
              const summary = [
                events ? `${events} acara` : "",
                tasks ? `${tasks} tugas` : "",
              ].filter(Boolean);

              return (
                <div
                  key={day.key}
                  role="gridcell"
                  className="flex justify-center"
                >
                  <button
                    type="button"
                    aria-label={`${formatDayKeyLabel(day.key)}${summary.length ? `, ${summary.join(", ")}` : ""}${isToday ? ", hari ini" : ""}`}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "relative grid size-8 place-items-center rounded-pill text-xs tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-brand/50",
                      isToday
                        ? "bg-brand font-semibold text-ink"
                        : "text-ink hover:bg-surface-1",
                      !isToday && (events || tasks) && "font-semibold"
                    )}
                    onClick={() => onOpenDay(day.key)}
                  >
                    {day.day}
                    {events || tasks ? (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5"
                      >
                        {events ? (
                          <span
                            className={cn(
                              "size-1 rounded-pill",
                              KIND_STYLES.event.dotClass
                            )}
                          />
                        ) : null}
                        {tasks ? (
                          <span
                            className={cn(
                              "size-1 rounded-pill",
                              KIND_STYLES.task.dotClass
                            )}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export function YearView({
  anchor,
  todayKey,
  itemsByDay,
  onOpenDay,
  onOpenMonth,
}: YearViewProps) {
  const { year } = parseDayKey(anchor);

  return (
    <div className="grid content-start gap-x-8 gap-y-8 rounded-lg bg-canvas p-5 sm:grid-cols-2 sm:p-6 lg:h-full lg:grid-cols-3 lg:overflow-y-auto xl:grid-cols-4 2xl:grid-cols-6">
      {MONTHS.map((month) => (
        <MiniMonth
          key={month}
          year={year}
          month={month}
          todayKey={todayKey}
          itemsByDay={itemsByDay}
          onOpenDay={onOpenDay}
          onOpenMonth={onOpenMonth}
        />
      ))}
    </div>
  );
}
