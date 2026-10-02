import { CalendarDays, X } from "lucide-react";
import { useRef, useState } from "react";
import type { MonthAnchor } from "@/components/calendar/month-anchor";
import { shiftMonthAnchor } from "@/components/calendar/month-anchor";
import { DailyNoteCalendar } from "@/components/daily-notes/daily-note-calendar";
import { monthAnchorFromDayKey } from "@/components/daily-notes/daily-note-date";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { formatShortDayKey, todayDayKey } from "@/lib/utils/date-time";
import { fieldErrorMessages } from "./form-fields";
import { TimePicker } from "./time-picker";

const NO_DATES: ReadonlySet<string> = new Set();

const TRIGGER_CLASS =
  "flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border border-ink/16 bg-canvas px-3 text-left font-sans text-[15px] text-ink outline-none hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 aria-invalid:border-destructive data-[popup-open]:border-brand";

type DateTimeFieldProps = {
  id: string;
  /** Visible legend, e.g. "Tenggat" or "Mulai". */
  label: string;
  /** "yyyy-MM-dd", or empty. */
  date: string;
  /** "HH:mm", or empty. */
  time: string;
  /** TanStack Form errors for the combined value. */
  errors?: unknown[];
  /**
   * Whether the value is optional: the date can be cleared and the time
   * removed. Labels for those states come from `clearDateLabel`,
   * `emptyTimeLabel`, and `emptyTimeHint`.
   */
  clearable?: boolean;
  clearDateLabel?: string;
  emptyTimeLabel?: string;
  emptyTimeHint?: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onBlur?: () => void;
};

/**
 * A date and a time side by side on one row. The date opens a month grid and
 * shows a short locale date ("2 Okt 2026"); the time opens an hour/minute
 * picker.
 */
export function DateTimeField({
  id,
  label,
  date,
  time,
  errors = [],
  clearable = false,
  clearDateLabel = "Hapus tanggal",
  emptyTimeLabel,
  emptyTimeHint,
  onDateChange,
  onTimeChange,
  onBlur,
}: DateTimeFieldProps) {
  const activeDayRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState("");
  const [anchor, setAnchor] = useState<MonthAnchor | null>(null);
  const messages = fieldErrorMessages(errors);
  const invalid = messages.length > 0;
  const errorId = invalid ? `${id}-error` : undefined;
  const dateLabel = formatShortDayKey(date);
  const lowerLabel = label.toLowerCase();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const todayKey = todayDayKey();

      setToday(todayKey);
      setAnchor(monthAnchorFromDayKey(date || todayKey));
    } else {
      onBlur?.();
    }

    setOpen(nextOpen);
  }

  function selectDate(dayKey: string) {
    onDateChange(dayKey);
    setOpen(false);
    onBlur?.();
  }

  function clearDate() {
    onDateChange("");
    onTimeChange("");
    setOpen(false);
    onBlur?.();
  }

  return (
    <fieldset className="space-y-2" aria-describedby={errorId}>
      <legend className="block font-sans text-sm font-semibold text-ink">
        {label}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,9rem)] items-center gap-2">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger
            id={`${id}-date`}
            aria-label={
              dateLabel
                ? `Tanggal ${lowerLabel}, ${dateLabel}`
                : `Pilih tanggal ${lowerLabel}`
            }
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            className={TRIGGER_CLASS}
          >
            <CalendarDays
              className="size-4 shrink-0 text-ink-muted"
              aria-hidden="true"
            />
            <span className={cn("truncate", !dateLabel && "text-ink-muted")}>
              {dateLabel || "Pilih tanggal"}
            </span>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-76"
            initialFocus={activeDayRef}
          >
            {anchor ? (
              <DailyNoteCalendar
                anchor={anchor}
                selectedDate={date}
                today={today}
                noteDates={NO_DATES}
                loading={false}
                activeDayRef={activeDayRef}
                onChangeMonth={(delta) =>
                  setAnchor((current) =>
                    current ? shiftMonthAnchor(current, delta) : current
                  )
                }
                onSelectDate={selectDate}
              />
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/8 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectDate(today || todayDayKey())}
              >
                Hari ini
              </Button>
              {clearable && date ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-ink-muted"
                  onClick={clearDate}
                >
                  <X />
                  {clearDateLabel}
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
        <span className="text-ink-muted" aria-hidden="true">
          –
        </span>
        <TimePicker
          id={`${id}-time`}
          label={`Jam ${lowerLabel}`}
          clearable={clearable}
          emptyLabel={emptyTimeLabel}
          emptyHint={emptyTimeHint}
          // A time only means something once a date is chosen.
          disabled={!date}
          value={time}
          invalid={invalid}
          describedBy={errorId}
          onBlur={onBlur}
          onChange={onTimeChange}
        />
      </div>
      {invalid ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {messages.join(" ")}
        </p>
      ) : null}
    </fieldset>
  );
}
