import { FileText } from "lucide-react";
import { EmptyState } from "@/components/app-states";
import { formatDayKeyLabel } from "@/components/calendar/month-grid";
import {
  DomainInlineError,
  DomainListSkeleton,
} from "@/components/domain/domain-page";
import type { DailyNoteSummary } from "@/lib/services/api/daily-notes/daily-notes.api";
import { formatDateTimeInZone } from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";

type RecentDailyNotesProps = {
  notes: DailyNoteSummary[];
  selectedDate: string;
  timezone: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onSelectDate: (date: string) => void;
};

export function RecentDailyNotes({
  notes,
  selectedDate,
  timezone,
  loading,
  error,
  onRetry,
  onSelectDate,
}: RecentDailyNotesProps) {
  return (
    <section aria-labelledby="recent-daily-notes-title">
      <div className="flex items-center gap-2 border-b border-ink/8 pb-3">
        <FileText className="size-4 text-ink-muted" aria-hidden="true" />
        <h2
          id="recent-daily-notes-title"
          className="font-display text-[17px] font-semibold"
        >
          Catatan terbaru
        </h2>
      </div>
      {loading ? <DomainListSkeleton label="Memuat catatan terbaru" /> : null}
      {error ? (
        <DomainInlineError
          title="Catatan terbaru tidak dapat dimuat"
          message={error.message}
          onRetry={onRetry}
        />
      ) : null}
      {!loading && !error && notes.length === 0 ? (
        <EmptyState
          className="py-8"
          title="Belum ada catatan harian"
          message="Pilih tanggal dan mulai menulis. Catatan pertama akan tersimpan otomatis setelah Anda mengetik."
        />
      ) : null}
      {!loading && !error && notes.length > 0 ? (
        <ul className="divide-y divide-ink/8">
          {notes.slice(0, 8).map((note) => (
            <li key={note.date}>
              <button
                type="button"
                aria-current={note.date === selectedDate ? "date" : undefined}
                className={cn(
                  "w-full rounded-sm py-4 text-left outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50",
                  note.date === selectedDate ? "text-ink" : "text-ink-muted"
                )}
                onClick={() => onSelectDate(note.date)}
              >
                <span className="block font-display text-sm font-semibold capitalize text-ink">
                  {formatDayKeyLabel(note.date)}
                </span>
                <span className="mt-1 block line-clamp-2 text-sm leading-6">
                  {note.excerpt || "Catatan tanpa teks"}
                </span>
                <time
                  dateTime={note.updatedAt}
                  className="mt-2 block font-mono text-xs"
                >
                  Diperbarui {formatDateTimeInZone(note.updatedAt, timezone)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
