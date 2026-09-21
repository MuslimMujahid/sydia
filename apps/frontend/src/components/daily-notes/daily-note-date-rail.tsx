import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import {
  formatDayKeyLabel,
  formatMonthAnchor,
  getMonthGridDays,
  type MonthAnchor,
} from "@/components/calendar/month-grid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "UTC",
});

const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  timeZone: "UTC",
});

const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 0, 1 + index, 12));

  return {
    short: WEEKDAY_SHORT_FORMAT.format(date),
    long: WEEKDAY_LONG_FORMAT.format(date),
  };
});

type DailyNoteDateRailProps = {
  anchor: MonthAnchor;
  selectedDate: string;
  today: string;
  noteDates: ReadonlySet<string>;
  loading: boolean;
  onChangeMonth: (delta: number) => void;
  onSelectDate: (date: string) => void;
};

export function DailyNoteDateRail({
  anchor,
  selectedDate,
  today,
  noteDates,
  loading,
  onChangeMonth,
  onSelectDate,
}: DailyNoteDateRailProps) {
  const days = useMemo(() => getMonthGridDays(anchor), [anchor]);

  return (
    <section aria-labelledby="daily-note-month-title">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="daily-note-month-title"
          aria-live="polite"
          className="font-display text-[17px] font-semibold capitalize"
        >
          {formatMonthAnchor(anchor)}
        </h2>
        <div className="flex items-center gap-1">
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
        className="mt-5"
        role="grid"
        aria-label={formatMonthAnchor(anchor)}
        aria-busy={loading}
      >
        <div className="grid grid-cols-7" role="row">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label.long}
              role="columnheader"
              aria-label={label.long}
              className="pb-2 text-center font-mono text-xs tracking-wider text-ink-muted uppercase"
            >
              <span aria-hidden="true">{label.short}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const hasNote = noteDates.has(day.key);
            const isSelected = day.key === selectedDate;
            const isToday = day.key === today;
            const label = `${formatDayKeyLabel(day.key)}${
              hasNote ? ", memiliki catatan" : ""
            }${isToday ? ", hari ini" : ""}`;

            return (
              <button
                key={day.key}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-current={isToday ? "date" : undefined}
                aria-selected={isSelected}
                className={cn(
                  "relative mx-auto grid size-10 place-items-center rounded-sm font-mono text-[13px] font-medium outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50",
                  !day.inMonth && "text-ink-muted",
                  isSelected && "bg-ink text-background hover:bg-ink",
                  isToday && !isSelected && "ring-2 ring-brand/50"
                )}
                onClick={() => onSelectDate(day.key)}
              >
                <span>{day.day}</span>
                {hasNote ? (
                  <span
                    className={cn(
                      "absolute mt-7 size-1 rounded-pill bg-brand",
                      isSelected && "bg-canvas"
                    )}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
        <span className="size-1.5 rounded-pill bg-brand" aria-hidden="true" />
        Titik menandai hari dengan catatan.
      </p>
    </section>
  );
}
