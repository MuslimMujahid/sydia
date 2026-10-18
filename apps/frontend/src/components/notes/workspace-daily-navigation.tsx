import { useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { shiftMonthAnchor } from "@/components/calendar/month-anchor";
import { DailyNoteCalendar } from "@/components/daily-notes/daily-note-calendar";
import {
  formatDailyNoteTitle,
  monthAnchorFromDayKey,
} from "@/components/daily-notes/daily-note-date";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { NoteEntry } from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";

const SHORT_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

type WorkspaceDailyNavigationProps = {
  today: string;
  selectedDate: string | null;
  entries: NoteEntry[];
  loading: boolean;
  onSelectDate: (date: string) => void;
};

export function WorkspaceDailyNavigation({
  today,
  selectedDate,
  entries,
  loading,
  onSelectDate,
}: WorkspaceDailyNavigationProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [month, setMonth] = useState(monthAnchorFromDayKey(today));
  const activeDay = useRef<HTMLButtonElement>(null);
  const daily = entries.filter((entry) => entry.kind === "daily");
  const recent = daily
    .filter((entry) => entry.ref.slice(6) !== today)
    .sort((a, b) => b.ref.localeCompare(a.ref))
    .slice(0, 2);

  const dates = [today, ...recent.map((entry) => entry.ref.slice(6))];

  return (
    <section aria-label="Catatan harian">
      <h2 className="mb-3 px-2 text-xs font-semibold text-ink-muted">
        Catatan harian
      </h2>
      <ul className="space-y-1" aria-busy={loading || undefined}>
        {dates.map((date) => (
          <li key={date}>
            <button
              type="button"
              aria-current={selectedDate === date ? "page" : undefined}
              onClick={() => onSelectDate(date)}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-[13px] outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand sm:min-h-10",
                selectedDate === date &&
                  "bg-brand/10 font-semibold text-brand hover:bg-brand/10"
              )}
            >
              <CalendarDays
                className={cn(
                  "size-4 shrink-0 text-ink-muted",
                  selectedDate === date && "text-brand"
                )}
              />
              <span className="min-w-0 truncate">
                {date === today
                  ? "Hari ini"
                  : formatDailyNoteTitle(date, today)}
              </span>
              {date === today ? (
                <span className="ml-auto shrink-0 text-xs font-normal">
                  {SHORT_DATE.format(new Date(`${today}T12:00:00Z`))}
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {loading ? (
          <li aria-label="Memuat catatan harian" className="space-y-1">
            <div className="h-10 animate-pulse rounded-sm bg-surface-1" />
            <div className="h-10 animate-pulse rounded-sm bg-surface-1" />
          </li>
        ) : null}
      </ul>
      <Popover
        open={pickerOpen}
        onOpenChange={(open) => {
          if (open) setMonth(monthAnchorFromDayKey(selectedDate ?? today));
          setPickerOpen(open);
        }}
      >
        <PopoverTrigger className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-[13px] text-ink-muted outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand sm:min-h-10">
          <CalendarDays className="size-4 shrink-0" />
          Pilih tanggal…
          <ChevronDown className="ml-auto size-3.5" />
        </PopoverTrigger>
        <PopoverContent
          aria-label="Pilih tanggal catatan"
          className="w-62 shadow-none"
          sideOffset={8}
          initialFocus={() => activeDay.current}
        >
          <DailyNoteCalendar
            compact
            anchor={month}
            selectedDate={selectedDate ?? today}
            today={today}
            noteDates={new Set(daily.map((entry) => entry.ref.slice(6)))}
            loading={loading}
            activeDayRef={activeDay}
            onChangeMonth={(delta) =>
              setMonth((current) => shiftMonthAnchor(current, delta))
            }
            onSelectDate={(date) => {
              setPickerOpen(false);
              onSelectDate(date);
            }}
          />
        </PopoverContent>
      </Popover>
    </section>
  );
}
