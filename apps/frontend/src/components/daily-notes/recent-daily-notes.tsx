import { RotateCcw } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import type { DailyNoteSummary } from "@/lib/services/api/daily-notes/daily-notes.api";
import { cn } from "@/lib/utils/cn";
import { formatDailyNoteShortDate } from "./daily-note-date";

const RECENT_NOTE_LIMIT = 5;

type RecentDailyNotesProps = {
  notes: DailyNoteSummary[];
  selectedDate: string;
  today: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onSelectDate: (date: string) => void;
};

/** The latest notes as one-line rows: the day and the start of its text. */
export function RecentDailyNotes({
  notes,
  selectedDate,
  today,
  loading,
  error,
  onRetry,
  onSelectDate,
}: RecentDailyNotesProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-[15px] font-semibold">
        Catatan terbaru
      </h2>
      {loading ? (
        <div
          className="mt-3 space-y-3"
          aria-busy="true"
          aria-label="Memuat catatan terbaru"
        >
          {["w-4/5", "w-3/5", "w-2/3"].map((width) => (
            <div
              key={width}
              className={cn(
                "h-4 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none",
                width
              )}
            />
          ))}
        </div>
      ) : null}
      {!loading && error ? (
        <div className="mt-2" role="alert">
          <p className="text-sm text-ink-muted">
            Catatan terbaru tidak dapat dimuat.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-[18px]"
            onClick={onRetry}
          >
            <RotateCcw />
            Coba lagi
          </Button>
        </div>
      ) : null}
      {!loading && !error && notes.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Belum ada catatan. Yang Anda tulis akan muncul di sini.
        </p>
      ) : null}
      {!loading && !error && notes.length > 0 ? (
        <ul className="-mx-2 mt-1.5">
          {notes.slice(0, RECENT_NOTE_LIMIT).map((note) => {
            const isSelected = note.date === selectedDate;

            return (
              <li key={note.date}>
                <button
                  type="button"
                  aria-current={isSelected ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 w-full items-baseline gap-3 rounded-sm px-2 py-2 text-left outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50",
                    isSelected && "bg-surface-1"
                  )}
                  onClick={() => onSelectDate(note.date)}
                >
                  <span className="min-w-20 shrink-0 font-mono text-xs whitespace-nowrap text-ink-muted">
                    {formatDailyNoteShortDate(note.date, today)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {note.excerpt || "Catatan tanpa teks"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
