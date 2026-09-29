import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { formatDailyNoteTitle, formatRelativeDayKey } from "./daily-note-date";

type DailyNoteHeaderProps = {
  selectedDate: string;
  today: string;
  calendarOpen: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenCalendar: () => void;
};

/**
 * The day being written, how far it is from today, and the controls to step
 * to another day. The calendar button only exists where the side rail doesn't.
 */
export function DailyNoteHeader({
  selectedDate,
  today,
  calendarOpen,
  onPrevious,
  onNext,
  onToday,
  onOpenCalendar,
}: DailyNoteHeaderProps) {
  const isToday = selectedDate === today;
  // Keep "28 September" together if a long title has to wrap.
  const title = formatDailyNoteTitle(selectedDate, today).replace(
    /(\d+) /,
    "$1\u00a0"
  );

  return (
    // Phones: controls share the first row with the eyebrow and the title gets
    // the full width below. From `sm` the controls sit beside the title.
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
      <p className="col-start-1 row-start-1 min-w-0 truncate">
        <Eyebrow>{formatRelativeDayKey(selectedDate, today)}</Eyebrow>
      </p>
      <h1
        aria-live="polite"
        className="col-span-2 row-start-2 mt-1 font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] sm:col-span-1 sm:mt-2"
      >
        <span className="sr-only">Catatan harian, </span>
        {title}
      </h1>
      <div className="col-start-2 row-start-1 -mr-2 flex items-center sm:row-span-2 sm:mr-0 sm:gap-1 sm:self-end">
        {isToday ? null : (
          <Button
            type="button"
            variant="dark-outline"
            size="sm"
            className="mr-1 max-sm:hidden"
            onClick={onToday}
          >
            Hari ini
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Hari sebelumnya"
          onClick={onPrevious}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Hari berikutnya"
          onClick={onNext}
        >
          <ChevronRight />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Pilih tanggal"
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
          className="xl:hidden"
          onClick={onOpenCalendar}
        >
          <CalendarDays />
        </Button>
      </div>
    </header>
  );
}
