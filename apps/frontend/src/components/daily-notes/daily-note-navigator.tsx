import type { Ref } from "react";
import type { MonthAnchor } from "@/components/calendar/month-anchor";
import type { DailyNoteSummary } from "@/lib/services/api/daily-notes/daily-notes.api";
import { cn } from "@/lib/utils/cn";
import { DailyNoteCalendar } from "./daily-note-calendar";
import { RecentDailyNotes } from "./recent-daily-notes";

export type DailyNoteNavigatorProps = {
  anchor: MonthAnchor;
  selectedDate: string;
  today: string;
  notes: DailyNoteSummary[];
  noteDates: ReadonlySet<string>;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onChangeMonth: (delta: number) => void;
  onSelectDate: (date: string) => void;
  activeDayRef?: Ref<HTMLButtonElement>;
  className?: string;
};

/** Everything used to find another day: the month grid and recent notes. */
export function DailyNoteNavigator({
  anchor,
  selectedDate,
  today,
  notes,
  noteDates,
  loading,
  error,
  onRetry,
  onChangeMonth,
  onSelectDate,
  activeDayRef,
  className,
}: DailyNoteNavigatorProps) {
  return (
    <div className={cn("space-y-5", className)}>
      <DailyNoteCalendar
        anchor={anchor}
        selectedDate={selectedDate}
        today={today}
        noteDates={noteDates}
        loading={loading}
        onChangeMonth={onChangeMonth}
        onSelectDate={onSelectDate}
        activeDayRef={activeDayRef}
      />
      <div className="border-t border-ink/8 pt-5">
        <RecentDailyNotes
          notes={notes}
          selectedDate={selectedDate}
          today={today}
          loading={loading}
          error={error}
          onRetry={onRetry}
          onSelectDate={onSelectDate}
        />
      </div>
    </div>
  );
}
