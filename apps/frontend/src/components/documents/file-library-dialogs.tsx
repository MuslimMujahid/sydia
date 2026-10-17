import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderInput,
  LoaderCircle,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createLibraryFolder,
  libraryRef,
  moveLibraryItems,
  previewLibraryDeletion,
  renameLibraryFolder,
  startLibraryDeletion,
  type LibraryItem,
  type LibraryRef,
} from "@/lib/services/api/file-library/file-library.api";
import {
  libraryFolderOptions,
  libraryQueryKeys,
  libraryQueryOptions,
} from "@/lib/services/api/file-library/file-library.queries";

const invalidates = { invalidateQueries: [libraryQueryKeys.all] };

interface FolderNameDialogProps {
  parentId: string | null;
  folder?: LibraryItem;
  onClose: () => void;
}

export function FolderNameDialog({
  parentId,
  folder,
  onClose,
}: FolderNameDialogProps) {
  const [name, setName] = useState(folder?.name ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      folder
        ? renameLibraryFolder({
            id: folder.id,
            name,
            revision: folder.revision,
          })
        : createLibraryFolder({ name, parentId }),
    meta: invalidates,
    onSuccess: onClose,
  });

  return (
    <DialogContent
      className="files-dialog files-name-dialog"
      backdropClassName="bg-ink/25"
    >
      <DialogTitle>{folder ? "Ganti nama folder" : "Folder baru"}</DialogTitle>
      <DialogDescription className="mt-2">
        {folder
          ? `Perbarui nama “${folder.name}”.`
          : "Buat folder di lokasi saat ini."}
      </DialogDescription>
      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="block space-y-2">
          <span>Nama folder</span>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            aria-invalid={mutation.isError}
            aria-describedby={
              mutation.isError ? "folder-name-error" : undefined
            }
          />
        </label>
        {mutation.error ? (
          <p
            id="folder-name-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {mutation.error.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            type="submit"
            variant="dark"
            disabled={mutation.isPending || !name.trim()}
          >
            {mutation.isPending
              ? "Menyimpan…"
              : folder
                ? "Simpan"
                : "Buat folder"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

interface MoveDialogProps {
  items: LibraryItem[];
  onClose: () => void;
  onMoved: () => void;
}

export function MoveDialog({ items, onClose, onMoved }: MoveDialogProps) {
  const [folderId, setFolderId] = useState<string>();
  const [offset, setOffset] = useState(0);
  const query = useQuery(
    libraryQueryOptions({
      folderId,
      offset,
      limit: 50,
      sort: "name",
      direction: "asc",
      foldersOnly: "true",
    })
  );

  const folder = useQuery(libraryFolderOptions(folderId));
  const mutation = useMutation({
    mutationFn: () =>
      moveLibraryItems({
        items: items.map(libraryRef),
        destinationId: folderId ?? null,
      }),
    meta: invalidates,
    onSuccess: onMoved,
  });

  const selectedFolders = new Set(
    items.filter((item) => item.kind === "folder").map((item) => item.id)
  );

  const unavailable = (id: string, ancestors: { id: string }[]) =>
    selectedFolders.has(id) ||
    ancestors.some((ancestor) => selectedFolders.has(ancestor.id));

  const navigate = (id?: string) => {
    setFolderId(id);
    setOffset(0);
  };

  return (
    <DialogContent
      className="files-dialog files-move-dialog"
      backdropClassName="bg-ink/25"
      showClose={false}
    >
      <DialogClose aria-label="Tutup" className="files-move-close">
        <ArrowLeft className="sm:hidden" />
        <X className="hidden sm:block" />
      </DialogClose>
      <DialogTitle>Pindahkan {items.length} item</DialogTitle>
      <p className="files-move-intro">Pilih folder tujuan</p>
      <DialogDescription className="mt-2">
        Pilih folder tujuan untuk item yang dipilih.
      </DialogDescription>
      <nav aria-label="Lokasi tujuan" className="files-destination-path">
        <Button size="sm" variant="ghost" onClick={() => navigate()}>
          <ArrowLeft aria-hidden="true" />
          File saya
        </Button>
        {folder.data?.data.path.map((crumb) => (
          <span key={crumb.id} className="flex max-w-full items-center gap-1">
            <ChevronRight className="size-4 shrink-0" />
            <button
              className="truncate underline-offset-4 hover:underline"
              onClick={() => navigate(crumb.id)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>
      <p className="files-destination-label">
        Folder di {folder.data?.data.folder.name ?? "File saya"}
      </p>
      <div className="files-destination-list" aria-busy={query.isPending}>
        {query.isPending ? <p className="py-6">Memuat folder…</p> : null}
        {query.error || folder.error ? (
          <p role="alert" className="py-4 text-destructive">
            {query.error?.message ?? folder.error?.message}
          </p>
        ) : null}
        {query.data?.data.map((item) => (
          <button
            key={item.id}
            className="files-destination-row"
            disabled={
              Boolean(item.deletingOperationId) ||
              unavailable(item.id, item.path)
            }
            onClick={() => navigate(item.id)}
          >
            <Folder className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <ChevronRight className="size-4 shrink-0" />
          </button>
        ))}
        {query.data && !query.data.data.length ? (
          <p className="py-6 text-sm text-ink-muted">
            Tidak ada subfolder di lokasi ini.
          </p>
        ) : null}
      </div>
      {query.data && query.data.pagination.total > 50 ? (
        <div className="mt-3 flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={!offset}
            onClick={() => setOffset(offset - 50)}
          >
            Sebelumnya
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={offset + 50 >= query.data.pagination.total}
            onClick={() => setOffset(offset + 50)}
          >
            Berikutnya
          </Button>
        </div>
      ) : null}
      {mutation.error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <div className="files-move-footer">
        <p>
          Tujuan: File saya
          {folder.data?.data.path.map((crumb) => ` / ${crumb.name}`).join("")}
        </p>
        <div className="files-dialog-actions">
          <Button
            variant="dark-outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            variant="dark"
            disabled={
              mutation.isPending ||
              query.isPending ||
              query.isError ||
              folder.isError ||
              Boolean(folder.data?.data.folder.deletingOperationId) ||
              Boolean(
                folderId && unavailable(folderId, folder.data?.data.path ?? [])
              )
            }
            onClick={() => mutation.mutate()}
          >
            <FolderInput aria-hidden="true" />
            {mutation.isPending ? "Memindahkan…" : "Pindahkan ke sini"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

interface DeleteDialogProps {
  items: LibraryRef[];
  names: string[];
  idempotencyKey: string;
  onClose: () => void;
  onStarted: () => void;
}

export function DeleteDialog({
  items,
  names,
  idempotencyKey,
  onClose,
  onStarted,
}: DeleteDialogProps) {
  const preview = useQuery({
    queryKey: [...libraryQueryKeys.all, "delete-preview", idempotencyKey],
    queryFn: () => previewLibraryDeletion(items),
    staleTime: Infinity,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      startLibraryDeletion({
        previewId: preview.data!.data.id,
        idempotencyKey,
      }),
    meta: invalidates,
    onSuccess: onStarted,
  });

  return (
    <DialogContent
      className="files-dialog files-delete-dialog"
      backdropClassName="bg-ink/25"
    >
      <div className="files-delete-icon">
        <TriangleAlert aria-hidden="true" />
      </div>
      <DialogTitle>Hapus {items.length} item permanen?</DialogTitle>
      <DialogDescription className="mt-3 break-words">
        {names
          .slice(0, 3)
          .map((name) => `“${name}”`)
          .join(", ")}
        {names.length > 3 ? ` dan ${names.length - 3} item lainnya` : ""}{" "}
        beserta seluruh isinya akan dihapus.
      </DialogDescription>
      {preview.isPending ? (
        <p role="status" className="mt-4 flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" /> Menghitung seluruh
          isi pilihan…
        </p>
      ) : null}
      {preview.data ? (
        <p className="mt-5 font-semibold">
          {preview.data.data.files.total} file dan{" "}
          {preview.data.data.folders.total} folder
        </p>
      ) : null}
      {preview.error || mutation.error ? (
        <div role="alert" className="mt-4 space-y-3 text-sm text-destructive">
          <p>{preview.error?.message ?? mutation.error?.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              mutation.reset();
              void preview.refetch();
            }}
          >
            Periksa pilihan lagi
          </Button>
        </div>
      ) : null}
      <p className="files-delete-warning">
        Tindakan ini tidak dapat dibatalkan.
        <br />
        File juga tidak lagi tersedia di chat.
      </p>
      <div className="files-delete-actions">
        <Button
          variant="dark-outline"
          disabled={mutation.isPending}
          onClick={onClose}
        >
          Batal
        </Button>
        <Button
          variant="destructive"
          disabled={!preview.data || preview.isFetching || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Trash2 aria-hidden="true" />
          {mutation.isPending ? "Mengonfirmasi…" : "Hapus permanen"}
        </Button>
      </div>
    </DialogContent>
  );
}
