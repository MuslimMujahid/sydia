import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useHydrated,
  useNavigate,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import {
  Folder,
  FolderInput,
  FolderPlus,
  Grid2X2,
  List,
  Search,
  ListFilter,
  ChevronDown,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  DomainInlineError,
  DomainListSkeleton,
} from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import { TopbarTitle } from "@/components/dashboard/topbar-slots";
import "./file-library.css";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/services/api/api";
import { documentQueryOptions } from "@/lib/services/api/documents/documents.queries";
import {
  libraryItemKey,
  libraryRef,
  moveLibraryItems,
  type LibraryItem,
} from "@/lib/services/api/file-library/file-library.api";
import {
  libraryFolderOptions,
  libraryQueryKeys,
  libraryQueryOptions,
} from "@/lib/services/api/file-library/file-library.queries";
import { cn } from "@/lib/utils/cn";
import { DocumentEditDialog } from "./document-edit-dialog";
import {
  DeleteDialog,
  FolderNameDialog,
  MoveDialog,
} from "./file-library-dialogs";
import { FileDeletionProgress } from "./file-deletion-progress";
import { useFileLibraryView } from "./use-file-library-view";
import { FileLibraryItem } from "./file-library-item";
import { FileLibraryBreadcrumbs } from "./file-library-breadcrumbs";
import { FileLibraryUploadResults } from "./file-library-upload-results";
import { useFileLibraryUpload } from "./use-file-library-upload";

interface FileEditorProps {
  id: string;
  onClose: () => void;
}

function FileEditor({ id, onClose }: FileEditorProps) {
  const query = useQuery(documentQueryOptions(id));
  if (query.isPending)
    return (
      <DialogContent>
        <DialogTitle>Memuat file…</DialogTitle>
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
      </DialogContent>
    );
  if (query.error)
    return (
      <DialogContent>
        <DialogTitle>File tidak dapat dimuat</DialogTitle>
        <p role="alert">{query.error.message}</p>
        <Button onClick={onClose}>Tutup</Button>
      </DialogContent>
    );

  return <DocumentEditDialog document={query.data} onClose={onClose} />;
}

export function DocumentPage() {
  const hydrated = useHydrated();
  const search = useSearch({ from: "/_app/files" });
  const navigate = useNavigate({ from: "/files" });
  const client = useQueryClient();
  const user = useRouteContext({ from: "/_app" });
  const input = useRef<HTMLInputElement>(null);
  const dragPreview = useRef<HTMLDivElement>(null);
  const [view, changeView] = useFileLibraryView(user.id);
  const [selected, setSelected] = useState<Map<string, LibraryItem>>(new Map());
  const [dragged, setDragged] = useState<LibraryItem[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "create" | "rename" | "move" | "delete" | "edit" | null
  >(null);

  const [targets, setTargets] = useState<LibraryItem[]>([]);
  const [deleteKey, setDeleteKey] = useState("");
  const uploads = useFileLibraryUpload();
  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const [announcement, setAnnouncement] = useState("");
  const folderId = search.folder;
  const query = useQuery(
    libraryQueryOptions({
      folderId,
      q: search.q,
      offset: search.offset ?? 0,
      limit: 50,
      sort: search.sort ?? "name",
      direction: search.direction ?? "asc",
    })
  );

  const folder = useQuery(libraryFolderOptions(folderId));
  const total = query.data?.pagination.total;
  const offset = search.offset ?? 0;

  useEffect(() => {
    if (total === undefined || offset === 0 || offset < total) return;
    const lastOffset = Math.floor(Math.max(total - 1, 0) / 50) * 50;
    void navigate({
      replace: true,
      search: (previous) => ({ ...previous, offset: lastOffset || undefined }),
    }).catch((error: unknown) =>
      console.error("Could not open the remaining files page.", error)
    );
  }, [total, offset, navigate]);

  const [previousListing, setPreviousListing] = useState(query.data);

  if (query.data && query.data !== previousListing) {
    setPreviousListing(query.data);
    setSelected((previous) => {
      const next = new Map(previous);

      if (
        previousListing?.pagination.offset === query.data!.pagination.offset
      ) {
        const currentIds = new Set(query.data!.data.map(libraryItemKey));
        for (const item of previousListing.data)
          if (!currentIds.has(libraryItemKey(item)))
            next.delete(libraryItemKey(item));
      }

      for (const item of query.data!.data) {
        const key = libraryItemKey(item);
        if (item.deletingOperationId) next.delete(key);
        else if (next.has(key)) next.set(key, item);
      }

      return next;
    });
  }

  useEffect(() => {
    const error = folder.error;
    if (
      !(error instanceof ApiClientError) ||
      error.status !== 404 ||
      error.details?.deleted !== true
    )
      return;
    const destination = error.details.destinationId;
    if (destination !== null && typeof destination !== "string") return;
    void navigate({
      search: (previous) => ({
        ...previous,
        folder: destination ?? undefined,
        q: undefined,
        offset: undefined,
      }),
      replace: true,
    })
      .then(() =>
        setAnnouncement(
          "Folder telah dihapus. Lokasi induk yang masih tersedia telah dibuka."
        )
      )
      .catch((failure: unknown) =>
        console.error(
          "Could not navigate to the surviving file location.",
          failure
        )
      );
  }, [folder.error, navigate]);
  const move = useMutation({
    mutationFn: moveLibraryItems,
    meta: { invalidateQueries: [libraryQueryKeys.all] },
    onSuccess: () => {
      setSelected(new Map());
      setAnnouncement("Item berhasil dipindahkan.");
    },
  });

  const scope = JSON.stringify([
    folderId,
    search.q,
    search.sort,
    search.direction,
  ]);

  const [previousScope, setPreviousScope] = useState(scope);

  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSelected(new Map());
    setDragged([]);
    setSearchInput(search.q ?? "");
  }

  const openFolder = (id?: string) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        folder: id,
        q: undefined,
        offset: undefined,
      }),
    });

  const openDialog = (value: typeof dialog, items: LibraryItem[] = []) => {
    setTargets(items);
    setDialog(value);
    if (value === "delete") setDeleteKey(crypto.randomUUID());
  };

  const closeDialog = () => setDialog(null);
  const toggle = (item: LibraryItem, checked: boolean) =>
    setSelected((previous) => {
      const next = new Map(previous);
      if (checked) next.set(libraryItemKey(item), item);
      else next.delete(libraryItemKey(item));

      return next;
    });

  const writable =
    query.data?.data.filter((item) => !item.deletingOperationId) ?? [];

  const allSelected =
    writable.length > 0 &&
    writable.every((item) => selected.has(libraryItemKey(item)));

  const canDrop = (id: string | null, path: { id: string }[]) =>
    dragged.length > 0 &&
    !dragged.some(
      (item) =>
        item.kind === "folder" &&
        (item.id === id || path.some((crumb) => crumb.id === item.id))
    );

  const drop = (
    event: DragEvent,
    id: string | null,
    path: { id: string }[]
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    if (canDrop(id, path))
      move.mutate({ items: dragged.map(libraryRef), destinationId: id });
    setDragged([]);
  };

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    uploads.start(
      files,
      folderId,
      folder.data
        ? `File saya / ${folder.data.data.path.map((crumb) => crumb.name).join(" / ")}`
        : "File saya"
    );
  }

  return (
    <div
      className={cn(
        "files-page",
        selected.size > 0 && "files-has-selection",
        view === "grid" && "files-grid-view",
        search.q && "files-searching"
      )}
    >
      <TopbarTitle>File</TopbarTitle>
      <header className="files-header">
        <h1 className="hidden lg:block">File</h1>
        <div className="files-header-actions">
          <Button
            variant="dark-outline"
            onClick={() => openDialog("create")}
            disabled={
              !hydrated ||
              Boolean(folder.data?.data.folder.deletingOperationId) ||
              Boolean(folderId && !folder.data)
            }
          >
            <FolderPlus />
            Folder baru
          </Button>
          <Button
            disabled={
              !hydrated ||
              uploads.pending ||
              Boolean(folder.data?.data.folder.deletingOperationId) ||
              Boolean(folderId && !folder.data)
            }
            onClick={() => input.current?.click()}
          >
            <Upload />
            {uploads.pending ? "Mengunggah…" : "Unggah file"}
          </Button>
        </div>
      </header>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept=".pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.csv,.html,.json,image/*,audio/*"
        onChange={handleFiles}
      />
      <section className="files-workspace" aria-label="Pustaka file">
        <div className="files-toolbar">
          <form
            className="files-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate({
                search: (previous) => ({
                  ...previous,
                  q: searchInput.trim() || undefined,
                  offset: undefined,
                }),
              });
            }}
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3 size-5 text-ink-muted"
            />
            <Input
              className="pr-10 pl-10"
              aria-label="Cari nama file atau folder"
              disabled={!hydrated}
              placeholder="Cari nama file atau folder…"
              maxLength={255}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {search.q ? (
              <button
                type="button"
                aria-label="Hapus pencarian"
                className="absolute top-2 right-2 grid size-7 place-items-center"
                onClick={() =>
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      q: undefined,
                      offset: undefined,
                    }),
                  })
                }
              >
                <X className="size-4" />
              </button>
            ) : null}
          </form>
          <div className="files-controls">
            <label className="files-sort">
              <ListFilter aria-hidden="true" />
              <span className="sr-only">Urutkan</span>
              <select
                aria-label="Urutkan"
                className="files-sort-select"
                value={`${search.sort ?? "name"}:${search.direction ?? "asc"}`}
                onChange={(event) => {
                  const [sort, direction] = event.target.value.split(":");
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      sort: sort as "name" | "createdAt",
                      direction: direction as "asc" | "desc",
                      offset: undefined,
                    }),
                  });
                }}
              >
                <option value="name:asc">Nama: A–Z</option>
                <option value="name:desc">Nama: Z–A</option>
                <option value="createdAt:desc">Terbaru ditambahkan</option>
                <option value="createdAt:asc">Terlama ditambahkan</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <div
              className="files-view-switch"
              role="group"
              aria-label="Tampilan file"
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "files-view-button",
                  view === "list" && "files-view-active"
                )}
                aria-label="Tampilan daftar"
                aria-pressed={view === "list"}
                onClick={() => changeView("list")}
              >
                <List />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "files-view-button",
                  view === "grid" && "files-view-active"
                )}
                aria-label="Tampilan kisi"
                aria-pressed={view === "grid"}
                onClick={() => changeView("grid")}
              >
                <Grid2X2 />
              </Button>
            </div>
          </div>
        </div>
        <FileLibraryBreadcrumbs
          path={folder.data?.data.path ?? []}
          dropTarget={dropTarget}
          canDrop={canDrop}
          onTarget={setDropTarget}
          onDrop={drop}
        />
        {search.q ? (
          <>
            <p className="files-search-summary">
              <span>Hasil di semua folder</span>
              <span>
                Unggah ke: {folder.data?.data.folder.name ?? "File saya"}
              </span>
            </p>
            <p className="files-search-count">
              {total ?? 0} hasil untuk “{search.q}”
            </p>
          </>
        ) : null}
        <div
          ref={dragPreview}
          aria-hidden="true"
          className="pointer-events-none fixed -left-96 top-0 rounded-sm bg-ink px-4 py-3 text-sm text-canvas"
        >
          {selected.size || 1} item
        </div>
        <p
          role="status"
          className={cn(announcement ? "text-sm text-ink-muted" : "sr-only")}
        >
          {announcement}
          {dragged.length
            ? `Memindahkan ${dragged.length} item. Lepaskan di folder tujuan atau tekan Escape untuk membatalkan.`
            : ""}
        </p>
        {move.error ? (
          <p role="alert" className="text-sm text-destructive">
            {move.error.message}
          </p>
        ) : null}
        <FileLibraryUploadResults
          results={uploads.results}
          pending={uploads.pending}
          destination={uploads.destination}
          onRetry={uploads.retry}
          onDismiss={uploads.dismiss}
        />
        <FileDeletionProgress />
        {query.isPending ? <DomainListSkeleton label="Memuat file" /> : null}
        {query.error || folder.error ? (
          <>
            <DomainInlineError
              title="File atau folder tidak dapat dimuat"
              message={query.error?.message ?? folder.error!.message}
              onRetry={() => {
                void query.refetch();
                void folder.refetch();
              }}
            />
            <Button
              variant="ghost"
              className="files-notice"
              onClick={() => openFolder()}
            >
              Kembali ke File saya
            </Button>
          </>
        ) : null}
        {query.data ? (
          <>
            <div
              className={cn(
                "files-selection",
                !selected.size && "files-selection-empty"
              )}
            >
              <label className="files-selection-count">
                <Checkbox
                  className="files-checkbox"
                  aria-label="Pilih semua item di halaman ini"
                  checked={allSelected}
                  indeterminate={!allSelected && selected.size > 0}
                  onCheckedChange={(checked) => {
                    setSelected((previous) => {
                      const next = new Map(previous);

                      for (const item of writable) {
                        if (checked) next.set(libraryItemKey(item), item);
                        else next.delete(libraryItemKey(item));
                      }

                      return next;
                    });
                  }}
                />
                <span>
                  {selected.size
                    ? `${selected.size} dipilih`
                    : "Pilih halaman ini"}
                </span>
              </label>
              {selected.size ? (
                <div className="files-selection-actions">
                  <Button
                    variant="dark-outline"
                    onClick={() => openDialog("move", [...selected.values()])}
                  >
                    <FolderInput />
                    Pindahkan ke…
                  </Button>
                  <Button
                    variant="dark-outline"
                    className="text-destructive"
                    onClick={() => openDialog("delete", [...selected.values()])}
                  >
                    <Trash2 />
                    Hapus permanen
                  </Button>
                </div>
              ) : null}
              {selected.size ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="files-clear-selection"
                  aria-label="Batal pilih"
                  onClick={() => setSelected(new Map())}
                >
                  <X />
                </Button>
              ) : null}
            </div>
            {!query.data.data.length ? (
              <div className="files-empty">
                <div>
                  <Folder aria-hidden="true" />
                  <h2>
                    {search.q
                      ? "Tidak ada hasil"
                      : folderId
                        ? "Folder ini masih kosong"
                        : "Belum ada file"}
                  </h2>
                  <p>
                    {search.q
                      ? "Coba nama lain atau hapus pencarian."
                      : folderId
                        ? `Unggah file atau buat subfolder di ${folder.data?.data.folder.name ?? "lokasi ini"}.`
                        : "Unggah file atau buat folder untuk mulai mengatur file Anda."}
                  </p>
                </div>
              </div>
            ) : null}
            {view === "list" &&
            query.data.data.length &&
            !selected.size &&
            !search.q ? (
              <div className="files-list-heading">
                <Checkbox
                  className="files-checkbox"
                  aria-label="Pilih semua item di halaman ini"
                  checked={allSelected}
                  indeterminate={!allSelected && selected.size > 0}
                  onCheckedChange={(checked) => {
                    setSelected((previous) => {
                      const next = new Map(previous);

                      for (const item of writable) {
                        if (checked) next.set(libraryItemKey(item), item);
                        else next.delete(libraryItemKey(item));
                      }

                      return next;
                    });
                  }}
                />

                <span />
                <span className="inline-flex items-center gap-3">
                  Nama
                  <ChevronDown className="size-3" />
                </span>
                <span>Ukuran</span>
                <span>Status</span>
                <span className="hidden xl:block">Ditambahkan</span>
                <span />
              </div>
            ) : null}
            <ul
              aria-label="File dan folder"
              className={cn(view === "grid" ? "files-grid" : "files-list")}
            >
              {query.data.data.map((item) => {
                const checked = selected.has(libraryItemKey(item));
                const isDrop =
                  item.kind === "folder" &&
                  canDrop(item.id, item.path) &&
                  !item.deletingOperationId;

                return (
                  <FileLibraryItem
                    key={libraryItemKey(item)}
                    item={item}
                    view={view}
                    selected={checked}
                    dropTarget={dropTarget === item.id}
                    showPath={Boolean(search.q)}
                    onSelect={(value) => toggle(item, value)}
                    onAction={(action) => openDialog(action, [item])}
                    drag={{
                      onDragStart: (event) => {
                        if (!window.matchMedia("(pointer:fine)").matches) {
                          event.preventDefault();

                          return;
                        }

                        const items = checked ? [...selected.values()] : [item];
                        setDragged(items);

                        if (dragPreview.current) {
                          dragPreview.current.textContent = `${items.length} item`;
                          event.dataTransfer.setDragImage(
                            dragPreview.current,
                            12,
                            12
                          );
                        }

                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          `${items.length} item`
                        );
                      },
                      onDragEnd: () => {
                        setDragged([]);
                        setDropTarget(null);
                      },
                      onDragOver: (event) => {
                        if (isDrop) {
                          event.preventDefault();
                          setDropTarget(item.id);
                        }
                      },
                      onDragLeave: () => {
                        if (dropTarget === item.id) setDropTarget(null);
                      },
                      onDrop: (event) => {
                        if (isDrop) drop(event, item.id, item.path);
                      },
                    }}
                  />
                );
              })}
            </ul>
            <div className="files-footer">
              <p>
                {query.data.pagination.total} item
                {query.data.pagination.total > 50
                  ? ` · ${query.data.pagination.offset + 1}–${query.data.pagination.offset + query.data.data.length}`
                  : ""}
              </p>
              {query.data.pagination.total > 50 ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!search.offset}
                    onClick={() =>
                      void navigate({
                        search: (previous) => ({
                          ...previous,
                          offset: Math.max(0, (previous.offset ?? 0) - 50),
                        }),
                      })
                    }
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      (search.offset ?? 0) + 50 >= query.data.pagination.total
                    }
                    onClick={() =>
                      void navigate({
                        search: (previous) => ({
                          ...previous,
                          offset: (previous.offset ?? 0) + 50,
                        }),
                      })
                    }
                  >
                    Berikutnya
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {selected.size ? (
          <div className="files-mobile-actions" aria-label="Tindakan pilihan">
            <Button
              variant="secondary"
              onClick={() => openDialog("move", [...selected.values()])}
            >
              <FolderInput />
              Pindahkan
            </Button>
            <Button
              variant="dark-outline"
              className="text-destructive"
              onClick={() => openDialog("delete", [...selected.values()])}
            >
              <Trash2 />
              Hapus
            </Button>
          </div>
        ) : null}
      </section>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        {dialog === "create" || dialog === "rename" ? (
          <FolderNameDialog
            key={dialog}
            parentId={folderId ?? null}
            folder={dialog === "rename" ? targets[0] : undefined}
            onClose={closeDialog}
          />
        ) : null}
        {dialog === "move" ? (
          <MoveDialog
            items={targets}
            onClose={closeDialog}
            onMoved={() => {
              closeDialog();
              setSelected(new Map());
              setAnnouncement("Item berhasil dipindahkan.");
            }}
          />
        ) : null}
        {dialog === "delete" ? (
          <DeleteDialog
            items={targets.map(libraryRef)}
            names={targets.map((item) => item.name)}
            idempotencyKey={deleteKey}
            onClose={closeDialog}
            onStarted={() => {
              closeDialog();
              setSelected(new Map());
              setAnnouncement("Penghapusan dimulai. Progres tersimpan.");
              void client.invalidateQueries({ queryKey: libraryQueryKeys.all });
            }}
          />
        ) : null}
        {dialog === "edit" ? (
          <FileEditor id={targets[0]!.id} onClose={closeDialog} />
        ) : null}
      </Dialog>
    </div>
  );
}
