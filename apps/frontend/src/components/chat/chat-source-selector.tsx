import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Folder,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  getLibraryItems,
  type LibraryCrumb,
} from "@/lib/services/api/file-library/file-library.api";
import { workspaceQueryOptions } from "@/lib/services/api/notes/notes.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { sourceKey, type ChatSource } from "./chat-source-types";

interface ChatSourceSelectorProps {
  kind: "files" | "notes";
  locale: SupportedLocale;
  onClose: () => void;
  returnFocus: () => HTMLElement | false;
  onConfirm: (sources: ChatSource[]) => void;
}

export function ChatSourceSelector({
  kind,
  locale,
  onClose,
  returnFocus,
  onConfirm,
}: ChatSourceSelectorProps) {
  const en = locale === "en";
  const [search, setSearch] = useState("");
  const [path, setPath] = useState<LibraryCrumb[]>([]);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Map<string, ChatSource>>(
    () => new Map()
  );

  const files = useQuery({
    queryKey: ["chat-source-files", path.at(-1)?.id, search, offset],
    queryFn: () =>
      getLibraryItems({
        folderId: search.trim() ? undefined : path.at(-1)?.id,
        q: search.trim() || undefined,
        offset,
        limit: 50,
        sort: "name",
        direction: "asc",
      }),
    enabled: kind === "files",
  });

  const notes = useQuery({
    ...workspaceQueryOptions(),
    enabled: kind === "notes",
  });

  const query = kind === "files" ? files : notes;
  const title =
    kind === "files"
      ? en
        ? "Add files and folders"
        : "Tambah berkas dan folder"
      : en
        ? "Add notes"
        : "Tambah catatan";

  function toggle(source: ChatSource) {
    setSelected((current) => {
      const next = new Map(current);
      const key = sourceKey(source);
      if (next.has(key)) next.delete(key);
      else next.set(key, source);

      return next;
    });
  }

  const noteRows =
    notes.data?.notes.filter((note) =>
      `${note.title} ${note.path} ${note.ref}`
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale))
    ) ?? [];

  const count = kind === "files" ? files.data?.data.length : noteRows.length;

  function row(
    source: ChatSource,
    detail: string,
    meta?: string,
    navigate?: () => void,
    unavailable = false,
    included = false
  ) {
    const checked = included || selected.has(sourceKey(source));
    const Icon =
      source.kind === "folder"
        ? Folder
        : source.id.startsWith("daily:")
          ? CalendarDays
          : FileText;

    return (
      <div
        key={sourceKey(source)}
        className={cn(
          "group flex min-h-13 items-center gap-4 border-b border-hairline/70 px-4 sm:px-7",
          checked && "bg-brand/5",
          source.kind === "note" && "min-h-18"
        )}
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 py-3">
          <span className="relative flex size-4.5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              className="peer absolute size-full cursor-pointer opacity-0"
              checked={checked}
              disabled={unavailable || included}
              onChange={() => toggle(source)}
              aria-label={`${en ? "Select" : "Pilih"} ${source.label}`}
            />
            <span className="flex size-4.5 items-center justify-center rounded-[5px] border border-ink/25 peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-disabled:opacity-40">
              {checked && (
                <Check className="size-3.5 text-white" strokeWidth={3} />
              )}
            </span>
          </span>
          <Icon className="size-4.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-6">
              {source.label}
            </span>
            {detail && (
              <span className="block truncate text-[13px] leading-5 text-ink-muted">
                {detail}
              </span>
            )}
          </span>
        </label>
        {included ? (
          <span className="shrink-0 text-[13px] text-ink-muted">
            {en ? "Included" : "Termasuk"}
          </span>
        ) : (
          meta && (
            <span className="shrink-0 text-[13px] text-ink-muted max-sm:hidden">
              {meta}
            </span>
          )
        )}
        {navigate && (
          <button
            type="button"
            onClick={navigate}
            aria-label={`${en ? "Open folder" : "Buka folder"} ${source.label}`}
            className="-mr-1 rounded-md p-2 text-ink-muted hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        variant="sheet"
        backdropClassName="bg-ink/30"
        className="flex h-[calc(100dvh-48px)] max-h-[calc(100dvh-48px)] flex-col overflow-hidden rounded-t-[16px] p-0 sm:h-[780px] sm:max-h-[calc(100dvh-64px)] sm:max-w-[640px] sm:rounded-[16px] sm:p-0"
      >
        <div className="shrink-0 px-4 pt-6 sm:px-7">
          <DialogTitle className="pr-6 text-lg sm:text-xl">{title}</DialogTitle>
          <DialogDescription className="mt-1.5 max-sm:sr-only">
            {kind === "files"
              ? en
                ? "Choose files or folders from My files. Folders include all files inside."
                : "Pilih file atau folder dari File saya. Folder mencakup semua file di dalamnya."
              : en
                ? "Choose saved custom notes or daily notes."
                : "Pilih catatan khusus atau catatan harian yang sudah tersimpan."}
          </DialogDescription>
          <div className="relative mt-5 mb-4">
            <Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-ink-muted" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="h-11 rounded-[10px] bg-transparent pl-10 text-[15px]"
              aria-label={en ? "Search sources" : "Cari sumber"}
              placeholder={
                kind === "files"
                  ? en
                    ? "Search files or folders…"
                    : "Cari nama file atau folder..."
                  : en
                    ? "Search note titles or dates…"
                    : "Cari judul atau tanggal catatan..."
              }
            />
          </div>
        </div>
        {kind === "files" && (
          <nav
            aria-label={en ? "Folder path" : "Lokasi folder"}
            className="flex min-h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline px-4 pb-3 text-sm sm:px-7"
          >
            <button
              type="button"
              className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-brand"
              onClick={() => {
                setPath([]);
                setOffset(0);
              }}
            >
              {en ? "My files" : "File saya"}
            </button>
            {!search &&
              path.map((crumb, i) => (
                <span
                  key={crumb.id}
                  className="flex shrink-0 items-center gap-1"
                >
                  <ChevronRight className="size-3.5 text-ink-muted" />
                  <button
                    type="button"
                    onClick={() => {
                      setPath(path.slice(0, i + 1));
                      setOffset(0);
                    }}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
          </nav>
        )}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          aria-busy={query.isFetching}
        >
          {query.isPending ? (
            <div
              role="status"
              aria-label={en ? "Loading sources" : "Memuat sumber"}
              className="space-y-5 p-7"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex h-8 items-center gap-4 motion-safe:animate-pulse"
                >
                  <div className="size-4 rounded bg-hairline" />
                  <div className="h-3 w-2/3 rounded bg-hairline" />
                </div>
              ))}
            </div>
          ) : query.isError ? (
            <div role="alert" className="px-7 py-12 text-center">
              <p className="text-sm">
                {en
                  ? "Sources could not be loaded. Your selections are kept."
                  : "Sumber tidak dapat dimuat. Pilihanmu tetap tersimpan."}
              </p>
              <Button
                type="button"
                variant="dark-outline"
                className="mt-4"
                onClick={() => void query.refetch()}
              >
                {en ? "Try again" : "Coba lagi"}
              </Button>
            </div>
          ) : count === 0 ? (
            <div
              role="status"
              className="px-7 py-16 text-center text-sm text-ink-muted"
            >
              {search
                ? en
                  ? "No sources match your search."
                  : "Tidak ada sumber yang cocok."
                : en
                  ? "No saved sources here yet."
                  : "Belum ada sumber tersimpan di sini."}
            </div>
          ) : kind === "files" ? (
            files.data?.data.map((item) =>
              row(
                {
                  kind: item.kind,
                  id: item.id,
                  label: item.name,
                  path: item.path.map((p) => p.name).join(" / "),
                },
                search ? item.path.map((p) => p.name).join(" / ") : "",
                item.kind === "folder"
                  ? item.childCount
                    ? `${item.childCount} item`
                    : en
                      ? "Empty"
                      : "Kosong"
                  : item.status !== "ready"
                    ? item.status === "failed"
                      ? en
                        ? "Failed"
                        : "Gagal"
                      : en
                        ? "Processing"
                        : "Memproses"
                    : item.size !== null
                      ? new Intl.NumberFormat(en ? "en" : "id", {
                          maximumFractionDigits: 1,
                        }).format(item.size / 1024) + " KB"
                      : undefined,
                item.kind === "folder"
                  ? () => {
                      setPath([...item.path, { id: item.id, name: item.name }]);
                      setSearch("");
                      setOffset(0);
                    }
                  : undefined,
                !!item.deletingOperationId ||
                  (item.kind === "file" && item.status !== "ready"),
                item.path.some((crumb) => selected.has(`folder:${crumb.id}`))
              )
            )
          ) : (
            (["note", "daily"] as const).map((group) => {
              const entries = noteRows.filter((n) => n.kind === group);

              return entries.length ? (
                <section key={group}>
                  <h3 className="px-4 pt-4 pb-2 text-xs font-medium text-ink-muted sm:px-7">
                    {group === "note"
                      ? en
                        ? "Custom notes"
                        : "Catatan khusus"
                      : en
                        ? "Daily notes"
                        : "Catatan harian"}
                  </h3>
                  {entries.map((note) => {
                    const label =
                      note.kind === "daily"
                        ? new Intl.DateTimeFormat(en ? "en-US" : "id-ID", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${note.ref.slice(6)}T12:00:00Z`))
                        : note.title;

                    const parentPath =
                      note.kind === "note"
                        ? note.path
                            .slice(
                              0,
                              Math.max(0, note.path.length - note.title.length)
                            )
                            .replace(/ \/ $/, "")
                        : "";

                    return row(
                      { kind: "note", id: note.ref, label, path: parentPath },
                      note.kind === "daily"
                        ? en
                          ? "Daily note"
                          : "Catatan harian"
                        : parentPath || (en ? "No folder" : "Tanpa folder"),
                      `${en ? "Updated" : "Diperbarui"} ` +
                        new Intl.DateTimeFormat(en ? "en-US" : "id-ID", {
                          day: "numeric",
                          month: "short",
                        }).format(new Date(note.updatedAt))
                    );
                  })}
                </section>
              ) : null;
            })
          )}
          {kind === "files" &&
            files.data &&
            files.data.pagination.total > 50 && (
              <div className="flex items-center justify-between p-4 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(offset - 50)}
                >
                  {en ? "Previous" : "Sebelumnya"}
                </Button>
                <span>
                  {offset + 1}–
                  {Math.min(offset + 50, files.data.pagination.total)} /{" "}
                  {files.data.pagination.total}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={offset + 50 >= files.data.pagination.total}
                  onClick={() => setOffset(offset + 50)}
                >
                  {en ? "Next" : "Berikutnya"}
                </Button>
              </div>
            )}
        </div>
        <div className="grid shrink-0 grid-cols-2 items-center gap-3 border-t border-hairline px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm sm:flex sm:px-7 sm:py-4">
          <span aria-live="polite" className="font-medium">
            {selected.size} {en ? "selected" : "dipilih"}
          </span>
          <button
            type="button"
            className="justify-self-end text-ink-muted underline underline-offset-2 sm:ml-5"
            disabled={!selected.size}
            onClick={() => setSelected(new Map())}
          >
            {en ? "Clear selection" : "Hapus pilihan"}
          </button>
          <Button
            type="button"
            variant="ghost"
            className="sm:ml-auto"
            onClick={onClose}
          >
            {en ? "Cancel" : "Batal"}
          </Button>
          <Button
            type="button"
            className="h-10 rounded-[10px] px-4 shadow-none"
            style={{
              backgroundImage:
                "linear-gradient(110deg, #ff8a4c, #f06694 55%, #8c5cff)",
            }}
            disabled={!selected.size}
            onClick={() => onConfirm([...selected.values()])}
          >
            {en ? "Add" : "Tambahkan"} ({selected.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
