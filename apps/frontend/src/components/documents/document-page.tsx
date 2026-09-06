import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
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
import { Badge } from "@/components/ui/badge";
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
  documentQueryOptions,
  documentsQueryOptions,
  useDeleteDocument,
  useUploadDocument,
} from "@/lib/services/api/documents/documents.queries";
import { formatDateTime } from "@/lib/utils/date-time";

const KIND_LABELS: Record<FileKind, string> = {
  document: "Dokumen",
  image: "Gambar",
  audio: "Audio",
};

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
  if (document.status === "processing") {
    return (
      <Badge dot="warn">
        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
        Sedang diproses
      </Badge>
    );
  }
  if (document.status === "failed")
    return <Badge dot="destructive">Pemrosesan gagal</Badge>;
  return <Badge dot="brand">Siap digunakan</Badge>;
}

function ContentSection({ document }: { document: Document }) {
  const primaryContent =
    document.transcript ??
    document.textContent ??
    document.imageDescription;
  const label =
    document.file.kind === "audio"
      ? "Transkrip"
      : document.file.kind === "image"
        ? "Deskripsi gambar"
        : "Isi dokumen";

  return (
    <section aria-labelledby="file-content-heading" className="mt-7 border-t border-surface-1 pt-6">
      <h3 id="file-content-heading" className="font-display text-xl font-bold">
        {label}
      </h3>
      {primaryContent ? (
        <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-ink-soft">
          {primaryContent}
        </p>
      ) : document.chunks?.length ? (
        <div className="mt-3 max-h-72 space-y-4 overflow-y-auto text-sm leading-6 text-ink-soft">
          {document.chunks.map((chunk) => (
            <p key={chunk.id}>
              {chunk.pageNumber ? (
                <span className="font-display font-semibold">Halaman {chunk.pageNumber}: </span>
              ) : null}
              {chunk.content}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Tidak ada teks yang dapat ditampilkan.</p>
      )}
    </section>
  );
}

function DocumentDetail({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const documentQuery = useQuery(documentQueryOptions(documentId));
  const ready = documentQuery.data?.status === "ready";
  const deleteMutation = useDeleteDocument();

  async function handleDelete() {
    const document = documentQuery.data;
    if (!document || !window.confirm(`Hapus ${document.file.originalName}? File dan hasil pemrosesannya tidak dapat dipulihkan.`)) return;
    await deleteMutation.mutateAsync(document.id);
    onClose();
  }

  if (documentQuery.isPending) {
    return (
      <DialogContent>
        <DialogTitle>Rincian file</DialogTitle>
        <DialogDescription className="mt-2">Memuat metadata dan hasil pemrosesan…</DialogDescription>
        <DomainListSkeleton label="Memuat rincian file" />
      </DialogContent>
    );
  }

  if (documentQuery.isError) {
    return (
      <DialogContent>
        <DialogTitle>File tidak dapat dimuat</DialogTitle>
        <DialogDescription className="mt-2">{documentQuery.error.message}</DialogDescription>
        <Button variant="secondary" className="mt-6" onClick={() => void documentQuery.refetch()}>
          Coba lagi
        </Button>
      </DialogContent>
    );
  }

  const document = documentQuery.data;
  return (
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogTitle>{document.title}</DialogTitle>
      <DialogDescription className="mt-2 break-all">{document.file.originalName}</DialogDescription>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <DocumentStatus document={document} />
        <Badge>{KIND_LABELS[document.file.kind]}</Badge>
        <span className="text-sm text-ink-muted">{formatSize(document.file.size)} · {formatDateTime(document.createdAt)}</span>
      </div>
      {document.status === "processing" ? (
        <div className="mt-7 flex items-start gap-3 border-y border-surface-1 py-5" role="status">
          <LoaderCircle className="mt-0.5 size-5 animate-spin text-brand-deep motion-reduce:animate-none" />
          <div>
            <h3 className="font-display font-bold">Sydia sedang membaca file ini</h3>
            <p className="mt-1 text-sm text-ink-muted">Rincian akan diperbarui otomatis setelah pemrosesan selesai.</p>
          </div>
        </div>
      ) : null}
      {document.status === "failed" ? (
        <div className="mt-7 flex items-start gap-3 border-y border-destructive/30 py-5" role="alert">
          <AlertCircle className="mt-0.5 size-5 text-destructive" />
          <div>
            <h3 className="font-display font-bold">File tidak dapat diproses</h3>
            <p className="mt-1 text-sm text-ink-muted">{document.errorMessage || "Unggah ulang file atau coba format lain."}</p>
          </div>
        </div>
      ) : null}
      {ready ? <ContentSection document={document} /> : null}
      {ready ? (
        <Button
          nativeButton={false}
          variant="secondary"
          size="sm"
          className="mt-5"
          render={<a href={getDocumentContentUrl(document.id)} target="_blank" rel="noreferrer" />}
        >
          Buka file asli
        </Button>
      ) : null}
      {document.structuredData ? (
        <details className="mt-6 border-t border-surface-1 pt-5">
          <summary className="cursor-pointer font-display font-semibold outline-none focus-visible:ring-3 focus-visible:ring-brand/40">Data terstruktur</summary>
          <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-editorial p-4 font-mono text-xs text-canvas">{JSON.stringify(document.structuredData, null, 2)}</pre>
        </details>
      ) : null}
      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={deleteMutation.isPending} onClick={() => void handleDelete()}>
          <Trash2 /> {deleteMutation.isPending ? "Menghapus…" : "Hapus file"}
        </Button>
        <Button nativeButton={false} render={<Link to="/chat" search={{ attachment: document.id }} />} disabled={document.status !== "ready"}>
          <MessageSquareText /> Tanyakan di chat
        </Button>
      </div>
      {deleteMutation.error ? <p className="mt-3 text-sm text-destructive" role="alert">{deleteMutation.error.message}</p> : null}
    </DialogContent>
  );
}

export function DocumentPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useQuery(documentsQueryOptions());
  const uploadMutation = useUploadDocument();

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

  return (
    <div className="space-y-9">
      <DomainPageHeader title="File" description="Unggah dokumen, gambar, atau audio. Sydia mengekstrak isi yang dapat Anda periksa dan gunakan dalam chat." action={<><input ref={inputRef} className="sr-only" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,image/*,audio/*" onChange={(event) => void handleFiles(event)} /><Button onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}><Upload /> {uploadMutation.isPending ? "Mengunggah…" : "Unggah file"}</Button></>} />
      {uploadMutation.isPending ? (
        <div className="flex items-center gap-3 border-y border-surface-1 py-4" role="status">
          <LoaderCircle className="size-5 animate-spin text-brand-deep motion-reduce:animate-none" />
          <p><span className="font-display font-semibold">{uploadMutation.variables.file.name}</span><span className="ml-2 text-sm text-ink-muted">Sedang diunggah. Jangan tutup halaman ini.</span></p>
        </div>
      ) : null}
      {uploadMutation.error ? <p className="text-sm text-destructive" role="alert">{uploadMutation.error.message} Pilih file untuk mencoba lagi.</p> : null}
      {query.isPending ? <DomainListSkeleton label="Memuat file" /> : null}
      {query.isError ? <DomainInlineError title="File tidak dapat dimuat" message={query.error.message} onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess && !query.data.length ? <EmptyState title="Belum ada file" message="Unggah file pertama agar Sydia dapat membacanya, membuat transkrip, dan menggunakannya saat menjawab." action={<Button onClick={() => inputRef.current?.click()}><Upload /> Unggah file pertama</Button>} /> : null}
      {query.isSuccess && query.data.length ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {query.data.map((document) => (
            <li key={document.id} className="flex items-center gap-4 py-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-1"><FileKindIcon kind={document.file.kind} /></span>
              <button type="button" className="min-w-0 flex-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-brand/40" onClick={() => setSelectedId(document.id)}>
                <span className="block truncate font-display font-bold text-ink">{document.title}</span>
                <span className="mt-1 block truncate text-sm text-ink-muted">{document.file.originalName} · {formatSize(document.file.size)} · {formatDateTime(document.createdAt)}</span>
                <span className="mt-2 block sm:hidden"><DocumentStatus document={document} /></span>
              </button>
              <div className="hidden sm:block"><DocumentStatus document={document} /></div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Tindakan untuk ${document.title}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSelectedId(document.id)}>Lihat rincian</DropdownMenuItem>
                  {document.status === "ready" ? <DropdownMenuItem render={<Link to="/chat" search={{ attachment: document.id }} />}><MessageSquareText /> Tanyakan di chat</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selectedId ? <DocumentDetail documentId={selectedId} onClose={() => setSelectedId(null)} /> : null}
      </Dialog>
    </div>
  );
}
