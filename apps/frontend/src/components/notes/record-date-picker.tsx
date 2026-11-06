import { AlertTriangle } from "lucide-react";
import { useRef, useState, type Ref } from "react";
import { isDayKey } from "@/components/calendar/calendar-date";
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

const NO_DATES: ReadonlySet<string> = new Set();

interface RecordDatePickerProps {
  id?: string;
  label: string;
  value: string;
  open: boolean;
  disabled: boolean;
  cell?: boolean;
  describedBy?: string;
  onOpenChange: (open: boolean) => void;
  onChange: (date: string) => void;
}

export function RecordDatePicker({
  id,
  label,
  value,
  open,
  disabled,
  cell = false,
  describedBy,
  onOpenChange,
  onChange,
}: RecordDatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeDayRef = useRef<HTMLButtonElement>(null);
  const validDate = isDayKey(value);
  const invalid = value !== "" && !validDate;

  function selectDate(date: string) {
    onChange(date);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        tabIndex={cell ? -1 : undefined}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
          cell
            ? "h-[35px] bg-transparent px-2.5 text-[13px]"
            : "h-11 rounded-sm border border-ink/16 bg-canvas px-3 text-base",
          invalid && "bg-amber-50"
        )}
      >
        <span className="truncate">
          {validDate
            ? formatShortDayKey(value)
            : value || (cell ? "" : "Pilih tanggal")}
        </span>
        {invalid ? (
          <AlertTriangle
            aria-label="Tidak cocok dengan tipe kolom"
            className="ml-auto size-3.5 shrink-0 text-amber-700"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Pilih tanggal: ${label}`}
        align="start"
        className="w-76"
        initialFocus={activeDayRef}
        finalFocus={
          cell
            ? () =>
                triggerRef.current?.closest<HTMLElement>(
                  "[data-record-cell]"
                ) ?? false
            : triggerRef
        }
      >
        {open ? (
          <RecordDateCalendar
            value={value}
            activeDayRef={activeDayRef}
            onSelectDate={selectDate}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

interface RecordDateCalendarProps {
  value: string;
  activeDayRef: Ref<HTMLButtonElement>;
  onSelectDate: (date: string) => void;
}

function RecordDateCalendar({
  value,
  activeDayRef,
  onSelectDate,
}: RecordDateCalendarProps) {
  const [today] = useState(todayDayKey);
  // Mismatched raw values stay visible in the trigger; no day is selected until replaced.
  const selectedDate = isDayKey(value) ? value : "";
  const [anchor, setAnchor] = useState(() =>
    monthAnchorFromDayKey(selectedDate || today)
  );

  return (
    <>
      <DailyNoteCalendar
        anchor={anchor}
        selectedDate={selectedDate}
        today={today}
        noteDates={NO_DATES}
        loading={false}
        activeDayRef={activeDayRef}
        onChangeMonth={(delta) =>
          setAnchor((current) => shiftMonthAnchor(current, delta))
        }
        onSelectDate={onSelectDate}
      />
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/8 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSelectDate(today)}
        >
          Hari ini
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectDate("")}
          >
            Hapus tanggal
          </Button>
        ) : null}
      </div>
    </>
  );
}
