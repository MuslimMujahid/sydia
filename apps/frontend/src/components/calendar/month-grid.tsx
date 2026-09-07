import { Plus } from "lucide-react";
import { useMemo } from "react";
import type {
  CalendarEvent,
  CalendarRange,
} from "@/lib/services/api/calendar/calendar.api";
import { cn } from "@/lib/utils/cn";

const DAY_KEY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const ZONED_PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "UTC",
});

const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  timeZone: "UTC",
});

// 2024-01-01 is a Monday, so index 0 labels the Monday-first column.
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) =>
  WEEKDAY_SHORT_FORMAT.format(new Date(Date.UTC(2024, 0, 1 + index, 12)))
);

const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, index) =>
  WEEKDAY_LONG_FORMAT.format(new Date(Date.UTC(2024, 0, 1 + index, 12)))
);

type CalendarDate = { year: number; month: number; day: number };

export type MonthAnchor = { year: number; month: number };

export type MonthGridDay = CalendarDate & { key: string; inMonth: boolean };

function dayKeyOf(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(
    date.day
  ).padStart(2, "0")}`;
}

function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addCalendarDays(date: CalendarDate, delta: number): CalendarDate {
  const shifted = utcNoon(date.year, date.month, date.day + delta);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function daysInMonth(anchor: MonthAnchor): number {
  return utcNoon(anchor.year, anchor.month + 1, 0).getUTCDate();
}

/** Day key ("yyyy-MM-dd") of an instant as seen in the given time zone. */
export function dayKeyInZone(date: Date, timeZone: string): string {
  let formatter = DAY_KEY_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    DAY_KEY_FORMATTERS.set(timeZone, formatter);
  }

  return formatter.format(date);
}

function zonedPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = ZONED_PARTS_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ZONED_PARTS_FORMATTERS.set(timeZone, formatter);
  }

  return formatter;
}

function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const values: Record<string, number> = {};

  for (const part of zonedPartsFormatter(timeZone).formatToParts(instant)) {
    if (part.type === "literal") continue;
    values[part.type] = Number(part.value);
  }

  const hour = values.hour === 24 ? 0 : (values.hour ?? 0);
  const wallAsUtc = Date.UTC(
    values.year ?? 0,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    hour,
    values.minute ?? 0,
    values.second ?? 0
  );

  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant (ISO) of a wall-clock midnight in the given time zone. */
function zonedMidnightToUtcIso(timeZone: string, date: CalendarDate): string {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const offset = timeZoneOffsetMs(timeZone, new Date(guess));
  let utc = guess - offset;
  const refined = timeZoneOffsetMs(timeZone, new Date(utc));
  if (refined !== offset) utc = guess - refined;

  return new Date(utc).toISOString();
}

/** Month containing "now" in the given time zone. */
export function getMonthAnchorInZone(
  timeZone: string,
  now = new Date()
): MonthAnchor {
  const [year = "0", month = "0"] = dayKeyInZone(now, timeZone).split("-");

  return { year: Number(year), month: Number(month) };
}

export function shiftMonthAnchor(
  anchor: MonthAnchor,
  delta: number
): MonthAnchor {
  const shifted = utcNoon(anchor.year, anchor.month + delta, 1);

  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/** Keep the selected day-of-month when the visible month changes. */
export function clampDayKeyToMonth(
  dayKey: string,
  anchor: MonthAnchor
): string {
  const [, , day = "1"] = dayKey.split("-");

  return dayKeyOf({
    year: anchor.year,
    month: anchor.month,
    day: Math.min(Number(day), daysInMonth(anchor)),
  });
}

/** Monday-first, week-aligned days covering the visible month (4–6 weeks). */
export function getMonthGridDays(anchor: MonthAnchor): MonthGridDay[] {
  const first: CalendarDate = {
    year: anchor.year,
    month: anchor.month,
    day: 1,
  };

  const weekday = utcNoon(first.year, first.month, first.day).getUTCDay();
  const leadDays = (weekday + 6) % 7;
  const weekCount = Math.ceil((leadDays + daysInMonth(anchor)) / 7);
  const start = addCalendarDays(first, -leadDays);

  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = addCalendarDays(start, index);

    return {
      ...date,
      key: dayKeyOf(date),
      inMonth: date.year === anchor.year && date.month === anchor.month,
    };
  });
}

/** Query range covering every visible grid day, in the page time zone. */
export function getMonthGridRange(
  anchor: MonthAnchor,
  timeZone: string
): CalendarRange {
  const days = getMonthGridDays(anchor);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last)
    throw new Error("Month grid must contain at least one day");
  const afterLast = addCalendarDays(last, 1);

  return {
    from: zonedMidnightToUtcIso(timeZone, first),
    to: zonedMidnightToUtcIso(timeZone, afterLast),
  };
}

/** Every day key an event covers, in the event's own time zone. */
export function getEventDayKeys(event: CalendarEvent): string[] {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const firstKey = dayKeyInZone(start, event.timezone);
  const lastInstant =
    end.getTime() > start.getTime() ? end.getTime() - 1 : start.getTime();

  const lastKey = dayKeyInZone(new Date(lastInstant), event.timezone);
  const keys: string[] = [];
  let date: CalendarDate = {
    year: Number(firstKey.slice(0, 4)),
    month: Number(firstKey.slice(5, 7)),
    day: Number(firstKey.slice(8, 10)),
  };

  for (let guard = 0; guard < 370; guard += 1) {
    const key = dayKeyOf(date);
    keys.push(key);
    if (key >= lastKey) break;
    date = addCalendarDays(date, 1);
  }

  return keys;
}

export function formatMonthAnchor(anchor: MonthAnchor): string {
  return MONTH_LABEL_FORMAT.format(utcNoon(anchor.year, anchor.month, 1));
}

export function formatDayKeyLabel(dayKey: string): string {
  return DAY_LABEL_FORMAT.format(
    utcNoon(
      Number(dayKey.slice(0, 4)),
      Number(dayKey.slice(5, 7)),
      Number(dayKey.slice(8, 10))
    )
  );
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = TIME_FORMATTERS.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    TIME_FORMATTERS.set(timeZone, formatter);
  }

  return formatter;
}

export function timeLabel(event: CalendarEvent): string {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return `${event.startAt} – ${event.endAt}`;
  const formatter = timeFormatter(event.timezone);

  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function startTimeLabel(event: CalendarEvent): string {
  const start = new Date(event.startAt);
  if (Number.isNaN(start.getTime())) return event.startAt;

  return timeFormatter(event.timezone).format(start);
}

const MAX_DESKTOP_ENTRIES = 3;
const MAX_MOBILE_MARKERS = 3;

type MonthGridProps = {
  anchor: MonthAnchor;
  timeZone: string;
  eventsByDay: Record<string, CalendarEvent[]>;
  selectedDay: string;
  onSelectDay: (dayKey: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onCreateForDay: (dayKey: string) => void;
};

export function MonthGrid({
  anchor,
  timeZone,
  eventsByDay,
  selectedDay,
  onSelectDay,
  onEditEvent,
  onCreateForDay,
}: MonthGridProps) {
  const days = useMemo(() => getMonthGridDays(anchor), [anchor]);
  const todayKey = dayKeyInZone(new Date(), timeZone);
  const weeks = useMemo(() => {
    const chunks: MonthGridDay[][] = [];
    for (let index = 0; index < days.length; index += 7)
      chunks.push(days.slice(index, index + 7));

    return chunks;
  }, [days]);

  return (
    <div role="grid" aria-label={formatMonthAnchor(anchor)}>
      <div role="row" className="grid grid-cols-7 pb-2">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            role="columnheader"
            aria-label={WEEKDAY_NAMES[index] ?? label}
            className="text-center font-mono text-xs tracking-wider text-ink-muted uppercase"
          >
            <span aria-hidden="true">{label}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-l border-surface-1">
        {weeks.map((week) => (
          <div
            role="row"
            key={week[0]?.key ?? `week-${week.length}`}
            className="contents"
          >
            {week.map((day) => {
              const events = eventsByDay[day.key] ?? [];
              const isToday = day.key === todayKey;
              const isSelected = day.key === selectedDay;
              const dayLabel = formatDayKeyLabel(day.key);

              return (
                <div
                  key={day.key}
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "group relative flex min-h-14 flex-col border-r border-b border-surface-1 p-1 transition-colors sm:min-h-28 sm:p-1.5",
                    !day.inMonth && "bg-surface-1/40",
                    isSelected ? "bg-brand/10" : "hover:bg-surface-1/50"
                  )}
                >
                  <button
                    type="button"
                    aria-label={`${dayLabel}${
                      events.length ? `, ${events.length} acara` : ""
                    }${isToday ? ", hari ini" : ""}`}
                    className="flex flex-col items-center gap-1 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-brand/50 sm:items-start"
                    onClick={() => onSelectDay(day.key)}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-pill font-display text-xs font-semibold sm:size-7 sm:text-sm",
                        isToday
                          ? "bg-brand text-ink"
                          : day.inMonth
                            ? "text-ink"
                            : "text-ink-weak",
                        isSelected && !isToday && "ring-2 ring-brand/60"
                      )}
                    >
                      {day.day}
                    </span>
                    {events.length ? (
                      <span
                        className="flex items-center gap-1 sm:hidden"
                        aria-hidden="true"
                      >
                        {events.slice(0, MAX_MOBILE_MARKERS).map((event) => (
                          <span
                            key={event.id}
                            className="size-1 rounded-pill bg-ink-muted"
                          />
                        ))}
                        {events.length > MAX_MOBILE_MARKERS ? (
                          <span className="font-mono text-xs leading-none text-ink-muted">
                            +{events.length - MAX_MOBILE_MARKERS}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                  <ul className="mt-1 hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
                    {events.slice(0, MAX_DESKTOP_ENTRIES).map((event) => (
                      <li key={event.id} className="min-w-0">
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-baseline gap-1.5 rounded-sm px-1 py-0.5 text-left outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50"
                          onClick={() => onEditEvent(event)}
                        >
                          <time
                            dateTime={event.startAt}
                            className="shrink-0 font-mono text-xs text-ink-soft"
                          >
                            {startTimeLabel(event)}
                          </time>
                          <span className="truncate text-xs font-medium">
                            {event.title}
                          </span>
                        </button>
                      </li>
                    ))}
                    {events.length > MAX_DESKTOP_ENTRIES ? (
                      <li>
                        <button
                          type="button"
                          className="w-full rounded-sm px-1 py-0.5 text-left text-xs text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50"
                          onClick={() => onSelectDay(day.key)}
                        >
                          +{events.length - MAX_DESKTOP_ENTRIES} lainnya
                        </button>
                      </li>
                    ) : null}
                  </ul>
                  <button
                    type="button"
                    aria-label={`Buat acara pada ${dayLabel}`}
                    className="absolute top-1 right-1 hidden size-6 place-items-center rounded-pill text-ink-muted opacity-0 transition-opacity outline-none hover:bg-surface-1 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand/50 sm:grid sm:group-hover:opacity-100"
                    onClick={() => onCreateForDay(day.key)}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
