import { useQuery } from "@tanstack/react-query";
import { Link2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNoteBacklinks } from "@/lib/services/api/notes/notes.api";

type NoteBacklinksProps = { target: string; onOpen: (ref: string) => void };

export function NoteBacklinks({ target, onOpen }: NoteBacklinksProps) {
  const query = useQuery({
    queryKey: ["notes", "backlinks", target],
    queryFn: () => getNoteBacklinks(target),
    refetchInterval: 5000,
  });

  return (
    <details open className="mt-9 border-t border-ink/8 pt-5">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4 text-ink-muted" />
        Tautan masuk
        {query.data ? (
          <span className="ml-auto text-xs font-normal text-ink-muted">
            {query.data.length} catatan
          </span>
        ) : null}
      </summary>
      {query.isPending ? (
        <p aria-busy="true" className="py-3 text-sm text-ink-muted">
          Memuat tautan masuk…
        </p>
      ) : query.isError ? (
        <div role="alert" className="text-sm">
          <p>Tautan masuk belum dapat dimuat.</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void query.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="py-3 text-sm text-ink-muted">
          Belum ada catatan yang menautkan ke sini.
        </p>
      ) : (
        <ul className="mt-2">
          {query.data.map((entry) => (
            <li key={entry.ref}>
              <button
                onClick={() => onOpen(entry.ref)}
                className="flex min-h-11 w-full items-center gap-3 rounded-sm py-2 text-left text-sm outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <FileText className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                <span className="hidden max-w-60 truncate text-xs text-ink-muted sm:block">
                  {entry.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
