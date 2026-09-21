import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatDayKeyLabel,
  shiftMonthAnchor,
  type MonthAnchor,
} from "@/components/calendar/month-grid";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import {
  dailyNoteQueryOptions,
  dailyNotesQueryOptions,
} from "@/lib/services/api/daily-notes/daily-notes.queries";
import { DailyNoteDateRail } from "./daily-note-date-rail";
import {
  ALL_DAILY_NOTES_RANGE,
  monthAnchorFromDayKey,
  shiftDayKey,
} from "./daily-note-date";
import { DailyNoteEditor } from "./daily-note-editor";
import { RecentDailyNotes } from "./recent-daily-notes";

export type DailyNotePageProps = {
  selectedDate: string;
  today: string;
  timezone: string;
  onDateChange: (date: string) => void;
};

export function DailyNotePage({
  selectedDate,
  today,
  timezone,
  onDateChange,
}: DailyNotePageProps) {
  const [visibleMonth, setVisibleMonth] = useState<{
    anchor: MonthAnchor;
    selectedDate: string;
  } | null>(null);

  const monthAnchor =
    visibleMonth?.selectedDate === selectedDate
      ? visibleMonth.anchor
      : monthAnchorFromDayKey(selectedDate);

  const noteQuery = useQuery(dailyNoteQueryOptions(selectedDate));
  const notesQuery = useQuery({
    ...dailyNotesQueryOptions(ALL_DAILY_NOTES_RANGE),
    placeholderData: (previous) => previous,
  });

  const noteDates = useMemo(
    () => new Set((notesQuery.data ?? []).map((note) => note.date)),
    [notesQuery.data]
  );

  function selectDate(date: string) {
    setVisibleMonth({
      anchor: monthAnchorFromDayKey(date),
      selectedDate: date,
    });
    onDateChange(date);
  }

  function changeMonth(delta: number) {
    setVisibleMonth({
      anchor: shiftMonthAnchor(monthAnchor, delta),
      selectedDate,
    });
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Catatan harian"
        description="Simpan satu catatan untuk setiap hari, lalu kembali ke tanggal mana pun saat Anda membutuhkannya."
      />
      <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="contents lg:sticky lg:top-8 lg:block lg:space-y-8">
          <div className="order-1">
            <DailyNoteDateRail
              anchor={monthAnchor}
              selectedDate={selectedDate}
              today={today}
              noteDates={noteDates}
              loading={notesQuery.isPending}
              onChangeMonth={changeMonth}
              onSelectDate={selectDate}
            />
          </div>
          <div className="order-3 lg:order-none">
            <RecentDailyNotes
              notes={notesQuery.data ?? []}
              selectedDate={selectedDate}
              timezone={timezone}
              loading={notesQuery.isPending}
              error={notesQuery.error}
              onRetry={() => void notesQuery.refetch()}
              onSelectDate={selectDate}
            />
          </div>
        </aside>
        <div className="order-2 min-w-0 space-y-4 lg:order-none">
          <div className="flex flex-col gap-4 border-b border-ink/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                className="mt-2 font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] capitalize"
                aria-live="polite"
              >
                {formatDayKeyLabel(selectedDate)}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Hari sebelumnya"
                onClick={() => selectDate(shiftDayKey(selectedDate, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="dark-outline"
                size="sm"
                disabled={selectedDate === today}
                onClick={() => selectDate(today)}
              >
                Hari ini
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Hari berikutnya"
                onClick={() => selectDate(shiftDayKey(selectedDate, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          {noteQuery.isPending ? (
            <DomainListSkeleton label="Memuat catatan harian" />
          ) : null}
          {noteQuery.isError ? (
            <DomainInlineError
              title="Catatan harian tidak dapat dimuat"
              message={noteQuery.error.message}
              onRetry={() => void noteQuery.refetch()}
            />
          ) : null}
          {noteQuery.isSuccess ? (
            <DailyNoteEditor
              key={selectedDate}
              date={selectedDate}
              initialContent={noteQuery.data?.content}
              noteExists={Boolean(noteQuery.data)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
