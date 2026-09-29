import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import {
  formatDayKeyLabel,
  formatMonthAnchor,
  getMonthGridDays,
  type MonthAnchor,
  type MonthGridDay,
} from "@/components/calendar/month-grid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { shiftDayKey } from "./daily-note-date";

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "UTC",
});

const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  timeZone: "UTC",
});

// 2024-01-01 is a Monday, matching the grid's Monday-first columns.
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 0, 1 + index, 12));

  return {
    short: WEEKDAY_SHORT_FORMAT.format(date),
    long: WEEKDAY_LONG_FORMAT.format(date),
  };
});

const ARROW_KEY_OFFSETS: Partial<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

type DailyNoteCalendarProps = {
  anchor: MonthAnchor;
  selectedDate: string;
  today: string;
  noteDates: ReadonlySet<string>;
  loading: boolean;
  onChangeMonth: (delta: number) => void;
  onSelectDate: (date: string) => void;
  /** Receives the day button that currently owns the grid's single tab stop. */
  activeDayRef?: Ref<HTMLButtonElement>;
};

function toWeeks(days: MonthGridDay[]): MonthGridDay[][] {
  const weeks: MonthGridDay[][] = [];

  for (let index = 0; index < days.length; index += 7)
    weeks.push(days.slice(index, index + 7));

  return weeks;
}

function dayLabel(dayKey: string, hasNote: boolean, isToday: boolean) {
  return `${formatDayKeyLabel(dayKey)}${hasNote ? ", memiliki catatan" : ""}${
    isToday ? ", hari ini" : ""
  }`;
}

/**
 * Month grid for picking a day. Dots mark days that already have a note.
 * The grid is one tab stop; arrow keys, Home, and End move between days and
 * cross into the neighbouring month when needed.
 */
export function DailyNoteCalendar({
  anchor,
  selectedDate,
  today,
  noteDates,
  loading,
  onChangeMonth,
  onSelectDate,
  activeDayRef,
}: DailyNoteCalendarProps) {
  const titleId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef(false);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const days = useMemo(() => getMonthGridDays(anchor), [anchor]);
  const weeks = useMemo(() => toWeeks(days), [days]);
  const visibleKeys = useMemo(
    () => new Set(days.map((day) => day.key)),
    [days]
  );

  const activeDate =
    [focusedDate, selectedDate, today].find(
      (key): key is string => key !== null && visibleKeys.has(key)
    ) ??
    days.find((day) => day.inMonth)?.key ??
    selectedDate;

  useEffect(() => {
    if (!moveFocusRef.current) return;

    moveFocusRef.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${activeDate}"]`)
      ?.focus();
  }, [activeDate]);

  function moveFocus(from: string, delta: number) {
    if (delta === 0) return;

    const next = shiftDayKey(from, delta);

    if (!visibleKeys.has(next)) onChangeMonth(delta > 0 ? 1 : -1);
    setFocusedDate(next);
    moveFocusRef.current = true;
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    dayKey: string,
    column: number
  ) {
    const offset =
      ARROW_KEY_OFFSETS[event.key] ??
      (event.key === "Home" ? -column : undefined) ??
      (event.key === "End" ? 6 - column : undefined);

    if (offset === undefined) return;

    event.preventDefault();
    moveFocus(dayKey, offset);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2
          id={titleId}
          aria-live="polite"
          className="font-display text-[15px] font-semibold capitalize"
        >
          {formatMonthAnchor(anchor)}
        </h2>
        <div className="-mr-2 flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Bulan sebelumnya"
            onClick={() => onChangeMonth(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Bulan berikutnya"
            onClick={() => onChangeMonth(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        aria-busy={loading || undefined}
        className="mt-2 flex flex-col gap-0.5"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label.long}
              role="columnheader"
              className="pb-1.5 text-center font-mono text-[11px] tracking-wider text-ink-muted uppercase"
            >
              <span aria-hidden="true">{label.short}</span>
              <span className="sr-only">{label.long}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.key} role="row" className="grid grid-cols-7">
            {week.map((day, column) => {
              const hasNote = noteDates.has(day.key);
              const isSelected = day.key === selectedDate;
              const isToday = day.key === today;
              const isActive = day.key === activeDate;

              return (
                <button
                  key={day.key}
                  ref={isActive ? activeDayRef : undefined}
                  type="button"
                  role="gridcell"
                  data-day={day.key}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={dayLabel(day.key, hasNote, isToday)}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "relative mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-sm font-mono text-[13px] font-medium outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50",
                    day.inMonth ? "text-ink" : "text-ink-muted",
                    isToday && !isSelected && "ring-1 ring-brand ring-inset",
                    isSelected && "bg-ink text-canvas hover:bg-ink"
                  )}
                  onClick={() => {
                    setFocusedDate(day.key);
                    onSelectDate(day.key);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, day.key, column)}
                >
                  {day.day}
                  {hasNote ? (
                    <span
                      className={cn(
                        "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-pill bg-brand",
                        isSelected && "bg-canvas"
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
