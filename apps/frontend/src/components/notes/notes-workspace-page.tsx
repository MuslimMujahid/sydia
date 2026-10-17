import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Link2,
  FileText,
  FolderPlus,
  Menu,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { TopbarTitle } from "@/components/dashboard/topbar-slots";
import { DailyNoteNavigator } from "@/components/daily-notes/daily-note-navigator";
import {
  monthAnchorFromDayKey,
  shiftDayKey,
} from "@/components/daily-notes/daily-note-date";
import {
  shiftMonthAnchor,
  type MonthAnchor,
} from "@/components/calendar/month-anchor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createWorkspaceItem,
  mutateWorkspaceItem,
  notesKeys,
  workspaceNoteQueryOptions,
  workspaceQueryOptions,
  type WorkspaceItem,
  type WorkspaceNote,
  type NoteEntry,
} from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";
import { createNotesNavigationStore } from "./navigation-state";
import {
  WorkspaceEditor,
  type WorkspaceEditorHandle,
} from "./workspace-editor";
import { ItemMenu, WorkspaceTree, type ItemAction } from "./workspace-tree";
import {
  WorkspaceDialog,
  type WorkspaceDialogTarget,
} from "./workspace-dialog";
import { WorkspaceSearch } from "./workspace-search";
import { useFolderCreation } from "./inline-folder-form";

type NotesWorkspacePageProps = {
  userId: string;
  today: string;
  selectedRef?: string;
  onNavigate: (ref: string) => Promise<void>;
};

export function NotesWorkspacePage({
  userId,
  today,
  selectedRef,
  onNavigate,
}: NotesWorkspacePageProps) {
  const client = useQueryClient();
  const navigation = useMemo(
    () => createNotesNavigationStore(userId, today),
    [userId, today]
  );

  const stored = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getServerSnapshot
  );

  const mounted = stored.mounted;
  const [browsedFolder, setBrowsedFolder] = useState<string | null>(null);
  const [view, setView] = useState<{
    mode: "note" | "folder" | "search" | "trash";
    selectedRef?: string;
  }>({ mode: "note", selectedRef });

  const mode = view.selectedRef === selectedRef ? view.mode : "note";

  function setMode(next: "note" | "folder" | "search" | "trash") {
    setView({ mode: next, selectedRef });
  }

  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<WorkspaceDialogTarget | null>(null);
  const [freshRef, setFreshRef] = useState<string | null>(null);
  const [month, setMonth] = useState<MonthAnchor>(monthAnchorFromDayKey(today));
  const editor = useRef<WorkspaceEditorHandle>(null);
  const pendingCreation = useRef<{
    parentId: string | null;
    requestKey: string;
  } | null>(null);

  const pendingLinks = useRef(new Map<string, string>());
  const [statusSlot, setStatusSlot] = useState<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const navigationHeading = useRef<HTMLHeadingElement>(null);
  const workspace = useQuery({ ...workspaceQueryOptions(), enabled: mounted });
  const requestedRef = selectedRef ?? stored.ref;
  const note = useQuery({
    ...workspaceNoteQueryOptions(requestedRef),
    enabled: mounted && mode === "note",
  });

  const missingStored =
    !selectedRef &&
    !note.data &&
    workspace.isSuccess &&
    requestedRef.startsWith("custom:") &&
    !workspace.data.items.some(
      (item) =>
        `custom:${item.id}` === requestedRef &&
        item.kind === "note" &&
        !item.trashedAt
    );

  const activeRef = missingStored ? `daily:${today}` : requestedRef;

  const items = workspace.data?.items ?? [];
  const entries = workspace.data?.notes ?? [];
  const currentItem = items.find(
    (item) => `custom:${item.id}` === activeRef && !item.trashedAt
  );

  const selectedFolder =
    mode === "note"
      ? (note.data?.parentId ?? currentItem?.parentId ?? null)
      : browsedFolder;

  const dailyDate = activeRef?.startsWith("daily:")
    ? activeRef.slice(6)
    : today;

  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: notesKeys.all });
  }, [client]);

  const folderCreation = useFolderCreation({ onCreated: refresh });

  useEffect(() => {
    if (missingStored)
      navigation.save(
        `daily:${today}`,
        "Catatan sebelumnya sudah tidak tersedia. Catatan hari ini dibuka."
      );
    else if (selectedRef && stored.ref !== selectedRef)
      navigation.save(selectedRef);
  }, [missingStored, selectedRef, stored.ref, navigation, today]);

  const guard = useCallback(
    async () => (editor.current ? editor.current.flush() : true),
    []
  );

  async function open(ref: string) {
    if (!(await guard())) return;
    setMode("note");
    navigation.save(ref);
    setNavOpen(false);
    if (ref.startsWith("daily:")) setMonth(monthAnchorFromDayKey(ref.slice(6)));
    await onNavigate(ref);
  }

  async function show(
    next: "folder" | "search" | "trash",
    folderId = selectedFolder
  ) {
    if (!(await guard())) return;
    setMode(next);
    if (next === "folder") setBrowsedFolder(folderId);
    if (next !== "search") setNavOpen(false);
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setNavOpen(true);
        requestAnimationFrame(() => searchInput.current?.focus());
      }
    };

    window.addEventListener("keydown", keydown);

    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      if (
        !pendingCreation.current ||
        pendingCreation.current.parentId !== selectedFolder
      )
        pendingCreation.current = {
          parentId: selectedFolder,
          requestKey: crypto.randomUUID(),
        };
      const item = await createWorkspaceItem({
        kind: "note",
        parentId: selectedFolder,
        requestKey: pendingCreation.current.requestKey,
      });

      await refresh();
      const ref = `custom:${item.id}`;
      setFreshRef(ref);
      await open(ref);
      pendingCreation.current = null;
    },
  });

  const move = useMutation({
    mutationFn: async ({
      item,
      parentId,
    }: {
      item: WorkspaceItem;
      parentId: string | null;
    }) => {
      if (!(await guard())) return;
      const latest = await client.fetchQuery({
        ...workspaceQueryOptions(),
        staleTime: 0,
      });

      const source = latest.items.find((candidate) => candidate.id === item.id);
      if (!source || source.trashedAt)
        throw new Error(
          "Item sudah tidak tersedia. Muat ulang daftar catatan."
        );
      await mutateWorkspaceItem({
        id: source.id,
        revision: source.revision,
        action: "update",
        parentId,
      });
      await refresh();
    },
  });

  const action = useMutation({
    mutationFn: async ({
      type,
      item,
    }: {
      type: ItemAction;
      item: WorkspaceItem;
    }) => {
      if (type === "copy-link") {
        await copyLink(`custom:${item.id}`);

        return;
      }

      if (!(await guard())) return;
      const latest = await client.fetchQuery({
        ...workspaceQueryOptions(),
        staleTime: 0,
      });

      const source = latest.items.find((candidate) => candidate.id === item.id);
      if (!source)
        throw new Error(
          "Item sudah tidak tersedia. Muat ulang daftar catatan."
        );
      if (type === "trash") {
        await mutateWorkspaceItem({
          id: source.id,
          revision: source.revision,
          action: "trash",
        });
        await refresh();
      } else setDialog({ action: type, item: source });
    },
  });

  async function copyLink(ref: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard is unavailable.");
      const url = new URL("/notes", window.location.origin);
      url.searchParams.set(
        ref.startsWith("daily:") ? "date" : "note",
        ref.startsWith("daily:") ? ref.slice(6) : ref.slice(7)
      );
      await navigator.clipboard.writeText(url.toString());
      setNotice("Tautan catatan disalin.");
    } catch (error) {
      console.warn("Copying the note link failed.", error);
      throw new Error(
        "Tautan belum dapat disalin. Izinkan akses papan klip lalu coba lagi."
      );
    }
  }

  const copy = useMutation({ mutationFn: copyLink });

  async function createLinked(title: string): Promise<NoteEntry> {
    const parentId = activeRef?.startsWith("custom:")
      ? (note.data?.parentId ?? null)
      : null;

    const key = JSON.stringify([parentId, title]);
    const requestKey = pendingLinks.current.get(key) ?? crypto.randomUUID();
    pendingLinks.current.set(key, requestKey);
    const item = await createWorkspaceItem({
      kind: "note",
      title,
      parentId,
      requestKey,
    });

    await refresh();
    pendingLinks.current.delete(key);

    return {
      ref: `custom:${item.id}`,
      id: item.id,
      kind: "note",
      title: item.title,
      path: title,
      parentId: item.parentId,
      excerpt: "",
      updatedAt: item.updatedAt,
    };
  }

  function saved(savedNote: WorkspaceNote) {
    client.setQueryData(notesKeys.detail(savedNote.ref), savedNote);
    void client.invalidateQueries({ queryKey: notesKeys.workspace });
    void client.invalidateQueries({ queryKey: ["notes", "backlinks"] });
  }

  const error = create.error ?? move.error ?? action.error ?? copy.error;
  const trash = items.filter(
    (item) =>
      item.trashedAt &&
      !items.some(
        (parent) =>
          parent.id === item.parentId &&
          parent.trashedAt &&
          parent.trashBatchId === item.trashBatchId
      )
  );

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col px-4 pt-4 pb-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-ink-muted" />
        <Input
          ref={searchInput}
          aria-label="Cari catatan"
          disabled={!mounted}
          placeholder="Cari catatan…"
          value={query}
          className="min-h-11 bg-canvas pl-10"
          onFocus={() => {
            void show("search");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") setNavOpen(false);
          }}
        />
      </div>
      <div className="scrollbar-subtle mt-5 -mr-4 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-4">
        <button
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand",
            activeRef?.startsWith("daily:") && mode === "note" && "bg-brand/10"
          )}
          onClick={() => void open(`daily:${dailyDate}`)}
        >
          <CalendarDays className="size-4 text-ink-muted" />
          Catatan harian
        </button>
        {activeRef?.startsWith("daily:") && mode === "note" ? (
          <div className="mt-3 px-1 pb-4">
            <DailyNoteNavigator
              anchor={month}
              selectedDate={dailyDate}
              today={today}
              notes={entries
                .filter((entry) => entry.kind === "daily")
                .map((entry) => ({
                  date: entry.ref.slice(6),
                  excerpt: entry.excerpt,
                  updatedAt: entry.updatedAt,
                }))
                .sort((a, b) => b.date.localeCompare(a.date))}
              noteDates={
                new Set(
                  entries
                    .filter((entry) => entry.kind === "daily")
                    .map((entry) => entry.ref.slice(6))
                )
              }
              loading={workspace.isPending}
              error={workspace.error}
              onRetry={() => void workspace.refetch()}
              onChangeMonth={(delta) =>
                setMonth((current) => shiftMonthAnchor(current, delta))
              }
              onSelectDate={(date) => void open(`daily:${date}`)}
            />
          </div>
        ) : (
          <p className="mt-1 px-3 text-xs text-ink-muted">
            Satu catatan untuk setiap hari
          </p>
        )}
        <div className="mt-5 flex items-center justify-between border-t border-ink/8 pt-4">
          <h2 className="px-2 text-xs font-semibold text-ink-muted">Folder</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
            aria-label="Folder baru"
            disabled={
              workspace.isPending ||
              workspace.isError ||
              Boolean(folderCreation.draft)
            }
            onClick={(event) =>
              folderCreation.start(selectedFolder, event.currentTarget)
            }
          >
            <FolderPlus />
          </Button>
        </div>
        {workspace.isPending ? (
          <div
            aria-busy="true"
            aria-label="Memuat folder"
            className="mt-4 space-y-3"
          >
            <div className="h-6 animate-pulse rounded bg-surface-1" />
            <div className="h-6 animate-pulse rounded bg-surface-1" />
          </div>
        ) : workspace.isError ? (
          <div role="alert" className="mt-4 text-sm">
            <p>{workspace.error.message}</p>
            <Button variant="ghost" onClick={() => void workspace.refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : (
          <WorkspaceTree
            items={items}
            folderCreation={folderCreation}
            selectedRef={mode === "note" ? activeRef : null}
            selectedFolder={mode === "folder" ? selectedFolder : null}
            onNote={(ref) => void open(ref)}
            onFolder={(id) => void show("folder", id)}
            onAction={(type, item) => action.mutate({ type, item })}
            onMove={(item, parentId) => move.mutate({ item, parentId })}
          />
        )}
      </div>
      <button
        className={cn(
          "mt-3 flex min-h-11 w-full items-center gap-3 border-t border-ink/8 px-3 pt-3 text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-brand",
          mode === "trash" && "font-semibold"
        )}
        onClick={() => void show("trash")}
      >
        <Trash2 className="size-4 text-ink-muted" />
        Sampah
        <span className="ml-auto text-xs text-ink-muted">{trash.length}</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-w-0 flex-col lg:h-dvh">
      <TopbarTitle heading={false}>Catatan</TopbarTitle>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-ink/8 bg-background px-4 lg:h-20 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Buka navigasi catatan"
          onClick={() => setNavOpen(true)}
        >
          <Menu />
        </Button>
        <p className="hidden text-2xl font-semibold tracking-[-0.02em] lg:block">
          Catatan
        </p>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <Button
            variant="dark-outline"
            onClick={() => void open(`daily:${today}`)}
          >
            <CalendarDays />
            <span>Hari ini</span>
          </Button>
          <Button
            disabled={
              create.isPending || workspace.isPending || workspace.isError
            }
            onClick={async () => {
              if (await guard()) create.mutate();
            }}
          >
            <Plus />
            {create.isPending ? "Membuat…" : "Catatan baru"}
          </Button>
        </div>
      </header>
      {notice || stored.warning || error ? (
        <div
          className="flex items-start gap-3 border-b border-ink/8 bg-canvas px-5 py-3 text-sm"
          role="alert"
        >
          <p className="flex-1">{error?.message ?? notice ?? stored.warning}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Tutup pemberitahuan"
            onClick={() => {
              setNotice(null);
              navigation.clearWarning();
              create.reset();
              move.reset();
              action.reset();
              copy.reset();
            }}
          >
            <X />
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Navigasi catatan"
          inert={!mounted}
          className="hidden w-70 shrink-0 border-r border-ink/8 bg-background lg:block"
        >
          {sidebar}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col bg-canvas">
          {mode === "note" ? (
            <>
              <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-ink/8 px-6 text-xs text-ink-muted">
                <span className="truncate">
                  {activeRef?.startsWith("daily:")
                    ? "Catatan harian"
                    : (items.find((item) => item.id === currentItem?.parentId)
                        ?.path ?? "Semua catatan")}
                </span>
                <div ref={setStatusSlot} className="ml-auto shrink-0" />
                {currentItem ? (
                  <ItemMenu
                    item={currentItem}
                    onAction={(type, item) => action.mutate({ type, item })}
                  />
                ) : activeRef.startsWith("daily:") ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hari sebelumnya"
                      onClick={() =>
                        void open(`daily:${shiftDayKey(dailyDate, -1)}`)
                      }
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hari berikutnya"
                      onClick={() =>
                        void open(`daily:${shiftDayKey(dailyDate, 1)}`)
                      }
                    >
                      <ChevronRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Salin tautan catatan"
                      disabled={copy.isPending}
                      onClick={() => copy.mutate(activeRef)}
                    >
                      <Link2 />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {note.isError && note.data ? (
                  <div
                    className="border-b border-ink/8 px-6 py-3 text-sm"
                    role="alert"
                  >
                    Catatan belum dapat diperbarui. Draf Anda tetap tersedia.
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void note.refetch()}
                    >
                      Coba lagi
                    </Button>
                  </div>
                ) : null}
                {note.isPending || !activeRef ? (
                  <div
                    aria-busy="true"
                    aria-label="Memuat catatan"
                    className="mx-auto max-w-[824px] space-y-6 px-6 py-12 sm:px-12"
                  >
                    <div className="h-10 w-2/3 animate-pulse rounded-sm bg-surface-1" />
                    <div className="h-72 animate-pulse rounded-sm bg-surface-1" />
                  </div>
                ) : note.isError && !note.data ? (
                  <div role="alert" className="p-8">
                    <h2 className="text-xl font-semibold">
                      Catatan tidak dapat dimuat
                    </h2>
                    <p className="mt-3 text-sm text-ink-muted">
                      {note.error.message}
                    </p>
                    <Button
                      className="mt-4"
                      variant="dark-outline"
                      onClick={() => void note.refetch()}
                    >
                      Coba lagi
                    </Button>
                  </div>
                ) : (
                  <WorkspaceEditor
                    key={activeRef}
                    ref={editor}
                    note={note.data}
                    statusSlot={statusSlot}
                    entries={entries}
                    today={today}
                    fresh={freshRef === activeRef}
                    onSaved={saved}
                    onOpen={(ref) => void open(ref)}
                    onCreateLink={createLinked}
                  />
                )}
              </div>
            </>
          ) : mode === "search" ? (
            <div className="overflow-y-auto">
              <WorkspaceSearch
                query={query}
                items={items}
                onOpen={(ref) => void open(ref)}
              />
            </div>
          ) : mode === "trash" ? (
            <section className="overflow-y-auto px-6 py-8 sm:px-12">
              <h1 className="text-2xl font-semibold">Sampah</h1>
              <p className="mt-3 text-sm text-ink-muted">
                Item disimpan sampai Anda menghapusnya permanen.
              </p>
              {trash.length === 0 ? (
                <p className="mt-10 text-sm text-ink-muted">Sampah kosong.</p>
              ) : (
                <ul className="mt-6 divide-y divide-ink/8">
                  {trash.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{item.title}</p>
                        <p className="mt-1 truncate text-xs text-ink-muted">
                          {item.path}
                          {item.kind === "folder"
                            ? " · folder beserta isinya"
                            : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="dark-outline"
                        onClick={() => setDialog({ action: "restore", item })}
                      >
                        Pulihkan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDialog({ action: "delete", item })}
                      >
                        Hapus permanen
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="overflow-y-auto px-6 py-8 sm:px-12">
              <h1 className="text-2xl font-semibold">
                {items.find((item) => item.id === selectedFolder)?.title ??
                  "Semua catatan"}
              </h1>
              <ul className="mt-6 space-y-2">
                {items
                  .filter(
                    (item) =>
                      !item.trashedAt && item.parentId === selectedFolder
                  )
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand"
                        onClick={() =>
                          item.kind === "folder"
                            ? void show("folder", item.id)
                            : void open(`custom:${item.id}`)
                        }
                      >
                        <FileText className="size-4 text-ink-muted" />
                        {item.title}
                      </button>
                    </li>
                  ))}
              </ul>
              {!items.some(
                (item) => !item.trashedAt && item.parentId === selectedFolder
              ) ? (
                <p className="mt-8 text-sm text-ink-muted">
                  Folder ini masih kosong. Buat catatan baru untuk mulai
                  menulis.
                </p>
              ) : null}
            </section>
          )}
        </section>
      </div>
      <Dialog
        open={navOpen}
        onOpenChange={(open, details) => {
          if (
            !open &&
            details.reason === "escape-key" &&
            folderCreation.draft
          ) {
            details.cancel();
            folderCreation.cancel(true);

            return;
          }

          setNavOpen(open);
        }}
      >
        <DialogContent
          variant="sheet"
          initialFocus={navigationHeading}
          className="flex h-[90dvh] max-h-[90dvh] flex-col overflow-hidden p-0"
        >
          <DialogTitle
            ref={navigationHeading}
            tabIndex={-1}
            className="px-6 pt-5 outline-none"
          >
            Catatan
          </DialogTitle>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </DialogContent>
      </Dialog>
      {dialog ? (
        <WorkspaceDialog
          target={dialog}
          items={items}
          onClose={() => setDialog(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
