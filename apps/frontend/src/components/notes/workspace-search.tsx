import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  searchWorkspaceNotes,
  type WorkspaceItem,
} from "@/lib/services/api/notes/notes.api";

type WorkspaceSearchProps = {
  query: string;
  items: WorkspaceItem[];
  onOpen: (ref: string) => void;
};

export function WorkspaceSearch({
  query,
  items,
  onOpen,
}: WorkspaceSearchProps) {
  const [kind, setKind] = useState("");
  const [folderId, setFolderId] = useState("");
  const search = useQuery({
    queryKey: ["notes", "search", query, kind, folderId],
    queryFn: () =>
      searchWorkspaceNotes(query, kind || undefined, folderId || undefined),
    enabled: Boolean(query.trim()),
    retry: false,
  });

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">
        Cari catatan
      </h1>
      <div className="mt-5 flex flex-wrap gap-3">
        <label className="text-xs text-ink-muted">
          Jenis catatan
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="mt-1 block min-h-11 max-w-full rounded-sm border border-ink/12 bg-canvas px-3 text-sm text-ink"
          >
            <option value="">Semua catatan</option>
            <option value="note">Catatan khusus</option>
            <option value="daily">Catatan harian</option>
          </select>
        </label>
        <label className="min-w-0 text-xs text-ink-muted">
          Folder
          <select
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="mt-1 block min-h-11 max-w-full rounded-sm border border-ink/12 bg-canvas px-3 text-sm text-ink"
          >
            <option value="">Semua folder</option>
            {items
              .filter((item) => item.kind === "folder" && !item.trashedAt)
              .map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path}
                </option>
              ))}
          </select>
        </label>
      </div>
      {!query.trim() ? (
        <p className="mt-10 flex items-center gap-2 text-sm text-ink-muted">
          <Search className="size-4" />
          Cari judul atau teks di dalam catatan.
        </p>
      ) : search.isPending ? (
        <div
          className="mt-8 space-y-4"
          aria-busy="true"
          aria-label="Mencari catatan"
        >
          <div className="h-16 animate-pulse rounded-sm bg-surface-1" />
          <div className="h-16 animate-pulse rounded-sm bg-surface-1" />
        </div>
      ) : search.isError ? (
        <div role="alert" className="mt-8">
          <p>{search.error.message}</p>
          <Button variant="ghost" onClick={() => void search.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : search.data.length === 0 ? (
        <p className="mt-10 text-sm text-ink-muted">
          Tidak ada catatan yang cocok dengan “{query}”. Coba kata lain atau
          ubah filter.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-ink/8">
          {search.data.map((entry) => (
            <li key={entry.ref}>
              <button
                className="flex min-h-24 w-full gap-3 rounded-sm py-5 text-left outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand"
                onClick={() => onOpen(entry.ref)}
              >
                <FileText className="mt-1 size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0">
                  <span className="block font-semibold">{entry.title}</span>
                  <span className="mt-1 block truncate text-xs text-ink-muted">
                    {entry.path}
                  </span>
                  <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-ink-muted">
                    {entry.excerpt}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
