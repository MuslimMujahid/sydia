import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getDocumentContentUrl,
  type Document,
  type FileKind,
} from "@/lib/services/api/documents/documents.api";
import {
  documentsQueryOptions,
  useDeleteDocument,
  useUploadDocument,
} from "@/lib/services/api/documents/documents.queries";
import { formatDateTime } from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";

function formatSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function FileKindIcon({ kind }: { kind: FileKind }) {
  const Icon =
    kind === "audio" ? FileAudio : kind === "image" ? FileImage : FileText;

  return <Icon className="size-5 text-brand-deep" aria-hidden="true" />;
}

function DocumentStatus({ document }: { document: Document }) {
  const status =
    document.status === "processing"
      ? "Sedang diproses"
      : document.status === "failed"
        ? "Pemrosesan gagal"
        : "Siap digunakan";

  const Icon =
    document.status === "processing"
      ? LoaderCircle
      : document.status === "failed"
        ? AlertCircle
        : Check;

  const colorClass =
    document.status === "processing"
      ? "bg-amber-500 text-white"
      : document.status === "failed"
        ? "bg-destructive text-white"
        : "bg-emerald-600 text-white";

  return (
    <span
      className={cn(
        "absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-canvas",
        colorClass
      )}
      title={status}
      aria-label={status}
    >
      <Icon
        className={cn(
          "size-2.5",
          document.status === "processing" &&
            "animate-spin motion-reduce:animate-none"
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{status}</span>
    </span>
  );
}

export function DocumentPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const query = useQuery(documentsQueryOptions());
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    for (const file of files) {
      try {
        await uploadMutation.mutateAsync({ file });
      } catch {
        break;
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // The mutation error remains visible in the confirmation dialog.
    }
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="File"
        description="Unggah dokumen, gambar, atau audio. Sydia mengekstrak isi yang dapat Anda periksa dan gunakan dalam chat."
        action={
          <>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,image/*,audio/*"
              onChange={(event) => void handleFiles(event)}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              <Upload /> {uploadMutation.isPending ? "Mengunggah…" : "Unggah file"}
            </Button>
          </>
        }
      />
      {uploadMutation.isPending ? (
        <div
          className="flex items-center gap-3 border-y border-surface-1 py-4"
          role="status"
        >
          <LoaderCircle className="size-5 animate-spin text-brand-deep motion-reduce:animate-none" />
          <p>
            <span className="font-display font-semibold">
              {uploadMutation.variables.file.name}
            </span>
            <span className="ml-2 text-sm text-ink-muted">
              Sedang diunggah. Jangan tutup halaman ini.
            </span>
          </p>
        </div>
      ) : null}
      {uploadMutation.error ? (
        <p className="text-sm text-destructive" role="alert">
          {uploadMutation.error.message} Pilih file untuk mencoba lagi.
        </p>
      ) : null}
      {query.isPending ? <DomainListSkeleton label="Memuat file" /> : null}
      {query.isError ? (
        <DomainInlineError
          title="File tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && !query.data.length ? (
        <EmptyState
          title="Belum ada file"
          message="Unggah file pertama agar Sydia dapat membacanya, membuat transkrip, dan menggunakannya saat menjawab."
        />
      ) : null}
      {query.isSuccess && query.data.length ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {query.data.map((document) => (
            <li key={document.id} className="flex items-center gap-4 py-5">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-md bg-surface-1">
                <FileKindIcon kind={document.file.kind} />
                <DocumentStatus document={document} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-display font-bold text-ink">
                  {document.title}
                </span>
                <span className="mt-1 block truncate text-sm text-ink-muted">
                  {formatSize(document.file.size)} · {formatDateTime(document.createdAt)}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Tindakan untuk ${document.title}`}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    render={
                      <a
                        href={getDocumentContentUrl(document.id)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <ExternalLink /> Buka
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      deleteMutation.reset();
                      setDeleteTarget(document);
                    }}
                  >
                    <Trash2 /> Hapus
                  </DropdownMenuItem>
                  {document.status === "ready" ? (
                    <DropdownMenuItem
                      render={
                        <Link to="/" search={{ attachment: document.id }} />
                      }
                    >
                      <MessageSquareText /> Tanyakan di chat
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Hapus file ini?</DialogTitle>
          <DialogDescription className="mt-3 break-all">
            &ldquo;{deleteTarget?.file.originalName}&rdquo; beserta hasil
            pemrosesannya akan dihapus permanen. Tindakan ini tidak dapat
            dibatalkan.
          </DialogDescription>
          {deleteMutation.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {deleteMutation.error.message} File tidak dihapus. Coba lagi.
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteMutation.isPending ? "Menghapus…" : "Hapus permanen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
