import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  shiftMonthAnchor,
  type MonthAnchor,
} from "@/components/calendar/month-grid";
import { TopbarTitle } from "@/components/dashboard/topbar-slots";
import { DomainInlineError } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  dailyNoteQueryOptions,
  dailyNotesQueryOptions,
} from "@/lib/services/api/daily-notes/daily-notes.queries";
import {
  ALL_DAILY_NOTES_RANGE,
  formatDailyNoteTitle,
  monthAnchorFromDayKey,
  shiftDayKey,
} from "./daily-note-date";
import { DailyNoteEditor, DailyNoteEditorSkeleton } from "./daily-note-editor";
import { DailyNoteHeader } from "./daily-note-header";
import {
  DailyNoteNavigator,
  type DailyNoteNavigatorProps,
} from "./daily-note-navigator";

// Neighbouring days are prefetched so the arrows switch days instantly.
const NEIGHBOUR_PREFETCH_STALE_MS = 30_000;

export type DailyNotePageProps = {
  selectedDate: string;
  today: string;
  onDateChange: (date: string) => void;
};

export function DailyNotePage({
  selectedDate,
  today,
  onDateChange,
}: DailyNotePageProps) {
  const queryClient = useQueryClient();
  const activeDayRef = useRef<HTMLButtonElement>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
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

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const noteDates = useMemo(
    () => new Set(notes.map((note) => note.date)),
    [notes]
  );

  useEffect(() => {
    for (const date of [
      shiftDayKey(selectedDate, -1),
      shiftDayKey(selectedDate, 1),
    ]) {
      void queryClient.prefetchQuery({
        ...dailyNoteQueryOptions(date),
        staleTime: NEIGHBOUR_PREFETCH_STALE_MS,
      });
    }
  }, [queryClient, selectedDate]);

  function selectDate(date: string) {
    setVisibleMonth({
      anchor: monthAnchorFromDayKey(date),
      selectedDate: date,
    });
    setNavigatorOpen(false);
    onDateChange(date);
  }

  function changeMonth(delta: number) {
    setVisibleMonth({
      anchor: shiftMonthAnchor(monthAnchor, delta),
      selectedDate,
    });
  }

  const navigatorProps: DailyNoteNavigatorProps = {
    anchor: monthAnchor,
    selectedDate,
    today,
    notes,
    noteDates,
    loading: notesQuery.isPending,
    error: notesQuery.error,
    onRetry: () => void notesQuery.refetch(),
    onChangeMonth: changeMonth,
    onSelectDate: selectDate,
  };

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-12">
      {/* The date below stays the page heading; the app bar names the page. */}
      <TopbarTitle heading={false}>Catatan harian</TopbarTitle>
      {/*
        The writing surface stretches to the bottom of the viewport: the
        offsets are the shell's app bar (below lg) plus main padding.
      */}
      <div className="mx-auto flex min-h-[calc(100dvh-5.25rem)] w-full max-w-3xl flex-col sm:min-h-[calc(100dvh-8rem)] lg:min-h-[calc(100dvh-6rem)] xl:mx-0 xl:max-w-none">
        <div className="max-sm:px-5">
          <DailyNoteHeader
            selectedDate={selectedDate}
            today={today}
            calendarOpen={navigatorOpen}
            onPrevious={() => selectDate(shiftDayKey(selectedDate, -1))}
            onNext={() => selectDate(shiftDayKey(selectedDate, 1))}
            onToday={() => selectDate(today)}
            onOpenCalendar={() => setNavigatorOpen(true)}
          />
        </div>
        <div className="mt-5 flex flex-1 flex-col sm:mt-6">
          {noteQuery.isPending ? (
            <DailyNoteEditorSkeleton
              label="Memuat catatan harian"
              className="flex-1"
            />
          ) : null}
          {noteQuery.isError ? (
            <div className="max-sm:px-5">
              <DomainInlineError
                title="Catatan harian tidak dapat dimuat"
                message={noteQuery.error.message}
                onRetry={() => void noteQuery.refetch()}
              />
            </div>
          ) : null}
          {noteQuery.isSuccess ? (
            <DailyNoteEditor
              key={selectedDate}
              date={selectedDate}
              label={`Catatan untuk ${formatDailyNoteTitle(selectedDate, today)}`}
              initialContent={noteQuery.data?.content}
              noteExists={Boolean(noteQuery.data)}
              className="flex-1"
            />
          ) : null}
        </div>
      </div>
      <aside
        aria-label="Pilih tanggal catatan"
        className="hidden xl:sticky xl:top-12 xl:block"
      >
        <DailyNoteNavigator {...navigatorProps} />
      </aside>
      <Dialog open={navigatorOpen} onOpenChange={setNavigatorOpen}>
        <DialogContent
          variant="sheet"
          showClose={false}
          initialFocus={activeDayRef}
        >
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Pilih tanggal</DialogTitle>
            <div className="-mr-2 flex items-center gap-1">
              {selectedDate === today ? null : (
                <Button
                  type="button"
                  variant="dark-outline"
                  size="sm"
                  onClick={() => selectDate(today)}
                >
                  Hari ini
                </Button>
              )}
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Tutup"
                  />
                }
              >
                <X />
              </DialogClose>
            </div>
          </div>
          <DailyNoteNavigator
            {...navigatorProps}
            activeDayRef={activeDayRef}
            className="mt-4"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
