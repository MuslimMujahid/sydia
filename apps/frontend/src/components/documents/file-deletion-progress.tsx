import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getLibraryDeletionFailures,
  previewLibraryDeletionRetry,
  retryLibraryDeletion,
  type DeletionOperation,
} from "@/lib/services/api/file-library/file-library.api";
import {
  libraryDeletionOptions,
  libraryQueryKeys,
} from "@/lib/services/api/file-library/file-library.queries";

interface OperationProgressProps {
  operation: DeletionOperation;
}

function OperationProgress({ operation }: OperationProgressProps) {
  const [open, setOpen] = useState(operation.status === "partial");
  const [offset, setOffset] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const failures = useQuery({
    queryKey: [...libraryQueryKeys.all, "failures", operation.id, offset],
    queryFn: () => getLibraryDeletionFailures(operation.id, offset),
    enabled: open && operation.status === "partial",
  });

  const retry = useMutation({
    mutationFn: (previewId?: string) =>
      retryLibraryDeletion({ id: operation.id, previewId }),
    meta: { invalidateQueries: [libraryQueryKeys.all] },
    onSuccess: () => setConfirmationOpen(false),
  });

  const preview = useMutation({
    mutationFn: () => previewLibraryDeletionRetry(operation.id),
    onSuccess: () => setConfirmationOpen(true),
  });

  const done = operation.files.completed + operation.folders.completed;
  const total = operation.files.total + operation.folders.total;

  return (
    <article
      className="files-deletion-operation"
      data-status={operation.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {operation.status === "partial" ? (
              <AlertCircle aria-hidden="true" />
            ) : null}
            {operation.status === "running"
              ? "Menghapus item…"
              : operation.status === "partial"
                ? "Penghapusan belum selesai"
                : "Penghapusan selesai"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {operation.status === "partial" ? (
              `${operation.files.completed} file dihapus · ${operation.files.failed} file gagal`
            ) : (
              <>
                {operation.files.completed} dari {operation.files.total} file ·{" "}
                {operation.folders.completed} dari {operation.folders.total}{" "}
                folder dihapus
              </>
            )}
          </p>
        </div>
      </div>
      {operation.status === "running" ? (
        <progress
          aria-label="Progres penghapusan"
          className="mt-3 h-2 w-full accent-brand"
          max={Math.max(total, 1)}
          value={done}
        />
      ) : null}
      {operation.status === "partial" ? (
        <p className="files-deletion-retained">
          {operation.files.failed + operation.folders.failed} gagal ·{" "}
          {operation.folders.completed} subfolder dihapus
          {operation.folders.retained
            ? `; ${operation.folders.retained} folder dipertahankan karena belum kosong.`
            : "."}
        </p>
      ) : null}
      {open && operation.status === "partial" ? (
        <div className="files-deletion-failures">
          {failures.isPending ? <p>Memuat rincian…</p> : null}
          {failures.error ? (
            <p role="alert" className="text-sm text-destructive">
              {failures.error.message}
            </p>
          ) : null}
          {failures.data?.data.map((failure) => (
            <div
              key={`${failure.kind}:${failure.itemId}`}
              className="files-deletion-failure"
            >
              <FileText aria-hidden="true" />
              <div>
                <p className="font-medium">{failure.name}</p>
                <p>{failure.error}</p>
              </div>
            </div>
          ))}
          {failures.data && failures.data.pagination.total > 10 ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!offset}
                onClick={() => setOffset(offset - 10)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={offset + 10 >= failures.data.pagination.total}
                onClick={() => setOffset(offset + 10)}
              >
                Berikutnya
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {retry.error || preview.error ? (
        <div className="mt-3 space-y-2" role="alert">
          <p className="text-sm text-destructive">
            {retry.error?.message ?? preview.error?.message}
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={preview.isPending}
            onClick={() => preview.mutate()}
          >
            Periksa item tersisa
          </Button>
        </div>
      ) : null}
      {operation.status === "partial" ? (
        <div className="files-deletion-actions">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Tutup rincian" : "Lihat rincian"}
          </Button>
          <Button
            size="sm"
            variant="dark"
            disabled={retry.isPending}
            onClick={() => retry.mutate(undefined)}
          >
            Coba ulang item gagal
          </Button>
        </div>
      ) : null}
      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent
          className="files-dialog files-delete-dialog"
          backdropClassName="bg-ink/25"
        >
          <DialogTitle>Konfirmasi item tersisa</DialogTitle>
          <DialogDescription className="mt-3">
            Isi pilihan mungkin berubah. {preview.data?.data.files.total} file
            dan {preview.data?.data.folders.total} folder akan dihapus permanen,
            termasuk semua isi folder tersisa. Tindakan ini tidak dapat
            dibatalkan.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="ghost"
              disabled={retry.isPending}
              onClick={() => setConfirmationOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={retry.isPending || !preview.data}
              onClick={() => retry.mutate(preview.data!.data.id)}
            >
              Hapus permanen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

export function FileDeletionProgress() {
  const [offset, setOffset] = useState(0);
  const query = useQuery(libraryDeletionOptions(offset));
  const client = useQueryClient();
  // Progress changes invalidate visible listings as confirmed deletes arrive.
  const progressKey = JSON.stringify(
    query.data?.data.map((row) => [
      row.id,
      row.status,
      row.files.completed,
      row.folders.completed,
    ])
  );

  useEffect(() => {
    if (progressKey)
      void client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "file-library" &&
          query.queryKey[1] !== "deletions" &&
          query.queryKey[1] !== "delete-preview",
      });
  }, [progressKey, client]);
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {query.error.message}{" "}
        <button className="underline" onClick={() => void query.refetch()}>
          Coba lagi
        </button>
      </p>
    );
  if (!query.data?.data.length) return null;

  return (
    <section
      aria-label="Aktivitas penghapusan"
      className="files-deletion-panel"
      aria-live="polite"
    >
      {query.data.data.map((operation) => (
        <OperationProgress key={operation.id} operation={operation} />
      ))}
      {query.data.pagination.total > 10 ? (
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={!offset}
            onClick={() => setOffset(offset - 10)}
          >
            Aktivitas lebih baru
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={offset + 10 >= query.data.pagination.total}
            onClick={() => setOffset(offset + 10)}
          >
            Aktivitas sebelumnya
          </Button>
        </div>
      ) : null}
    </section>
  );
}
