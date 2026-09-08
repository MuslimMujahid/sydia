import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import {
  FieldShell,
  FormError,
  SelectField,
  TextField,
} from "@/components/forms/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/lib/hooks/forms";
import type {
  CreateMemoryInput,
  Memory,
  MemorySourceType,
  MemoryStatus,
} from "@/lib/services/api/memories/memories.api";
import {
  memoryQueryOptions,
  memoriesQueryOptions,
  memorySearchQueryOptions,
  useCreateMemory,
  useDeleteMemory,
  useSetMemoryPinned,
  useUpdateMemory,
} from "@/lib/services/api/memories/memories.queries";
import { formatDateTime } from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";

const memorySchema = z.object({
  content: z.string().trim().min(1, "Masukkan informasi yang perlu diingat."),
  category: z.string(),
});

const STATUS_LABELS: Record<MemoryStatus, string> = {
  active: "Aktif",
  superseded: "Digantikan",
};

const STATUS_FILTERS: Array<{ value: MemoryStatus | "all"; label: string }> = [
  { value: "all", label: "Semua memori" },
  { value: "active", label: STATUS_LABELS.active },
  { value: "superseded", label: STATUS_LABELS.superseded },
];

const SOURCE_LABELS: Record<MemorySourceType, string> = {
  dashboard: "Disimpan dari dasbor",
  chat: "Disimpan dari chat web",
  whatsapp: "Disimpan dari WhatsApp",
  document: "Berasal dari dokumen",
  automatic: "Dipilih otomatis oleh Sydia",
};

const SOURCE_ICONS: Record<MemorySourceType, ReactNode> = {
  dashboard: <UserRound className="size-4" />,
  chat: <MessageSquareText className="size-4" />,
  whatsapp: <MessageSquareText className="size-4" />,
  document: <FileText className="size-4" />,
  automatic: <Bot className="size-4" />,
};

function MemoryEditor({
  memory,
  onClose,
}: {
  memory?: Memory;
  onClose: () => void;
}) {
  const createMutation = useCreateMemory();
  const updateMutation = useUpdateMemory();
  const deleteMutation = useDeleteMemory();
  const mutation = memory ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: {
      content: memory?.content ?? "",
      category: memory?.category ?? "",
    },
    validators: { onChange: memorySchema },
    onSubmit: async ({ value }) => {
      const values: CreateMemoryInput = {
        content: value.content.trim(),
        category: value.category.trim() || null,
      };

      if (memory)
        await updateMutation.mutateAsync({ memoryId: memory.id, values });
      else await createMutation.mutateAsync(values);
      onClose();
    },
  });

  async function handleDelete() {
    if (
      !memory ||
      !window.confirm(
        "Hapus memori ini? Sydia tidak akan dapat mengambilnya lagi."
      )
    )
      return;
    await deleteMutation.mutateAsync(memory.id);
    onClose();
  }

  return (
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
      <DialogTitle>{memory ? "Rincian memori" : "Simpan memori"}</DialogTitle>
      <DialogDescription className="mt-2">
        {memory
          ? "Periksa isi, asal, dan riwayat informasi ini."
          : "Simpan informasi yang perlu Sydia ingat di percakapan mendatang."}
      </DialogDescription>
      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          mutation.reset();
          void form.handleSubmit();
        }}
      >
        <form.Field name="content">
          {(field) => (
            <FieldShell
              id="memory-content"
              label="Informasi"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="memory-content"
                  className="min-h-32"
                  autoFocus
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => (
            <FieldShell
              id="memory-category"
              label="Kategori"
              description="Contoh: preferensi, kontak, pekerjaan, kesehatan."
            >
              {({ describedBy }) => (
                <TextField
                  id="memory-category"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        {memory ? (
          <section
            aria-labelledby="memory-provenance-title"
            className="border-y border-surface-1 py-5"
          >
            <h3 id="memory-provenance-title" className="font-display font-bold">
              Asal & riwayat
            </h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-ink-muted">Sumber</dt>
              <dd className="flex items-center gap-2 text-ink-soft">
                {SOURCE_ICONS[memory.source.type]}{" "}
                {memory.source.label || SOURCE_LABELS[memory.source.type]}
              </dd>
              {memory.source.documentName ? (
                <>
                  <dt className="text-ink-muted">Dokumen</dt>
                  <dd>{memory.source.documentName}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">Dibuat</dt>
              <dd>{formatDateTime(memory.createdAt)}</dd>
              <dt className="text-ink-muted">Diperbarui</dt>
              <dd>{formatDateTime(memory.updatedAt)}</dd>
              {memory.supersedesId ? (
                <>
                  <dt className="text-ink-muted">Menggantikan</dt>
                  <dd>Versi memori sebelumnya</dd>
                </>
              ) : null}
              {memory.supersededById ? (
                <>
                  <dt className="text-ink-muted">Digantikan oleh</dt>
                  <dd>Versi memori yang lebih baru</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}
        <FormError
          message={mutation.error?.message ?? deleteMutation.error?.message}
        />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-between">
          {memory ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              <Trash2 />
              {deleteMutation.isPending ? "Menghapus…" : "Hapus memori"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3 sm:justify-end">
            <Button type="button" variant="dark-outline" onClick={onClose}>
              Batal
            </Button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isSubmitting ? "Menyimpan…" : "Simpan memori"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

function MemoryEditorLoader({
  memoryId,
  onClose,
}: {
  memoryId: string;
  onClose: () => void;
}) {
  const query = useQuery(memoryQueryOptions(memoryId));

  if (query.isPending) {
    return (
      <DialogContent>
        <DialogTitle>Rincian memori</DialogTitle>
        <DialogDescription className="mt-2">
          Memuat memori yang tersimpan…
        </DialogDescription>
        <DomainListSkeleton label="Memuat rincian memori" />
      </DialogContent>
    );
  }

  if (query.isError) {
    return (
      <DialogContent>
        <DialogTitle>Memori tidak dapat dimuat</DialogTitle>
        <DialogDescription className="mt-2">
          {query.error.message}
        </DialogDescription>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => void query.refetch()}
        >
          Coba lagi
        </Button>
      </DialogContent>
    );
  }

  return <MemoryEditor memory={query.data} onClose={onClose} />;
}

function MemoryRow({ memory, onEdit }: { memory: Memory; onEdit: () => void }) {
  const pinMutation = useSetMemoryPinned();
  const unavailable =
    memory.status === "superseded" || Boolean(memory.supersededById);

  return (
    <li className="grid gap-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {memory.pinned ? (
            <Badge dot="brand">
              <Pin className="size-3.5" /> Disematkan
            </Badge>
          ) : null}
          {memory.status === "superseded" ? (
            <Badge dot="warn">{STATUS_LABELS.superseded}</Badge>
          ) : unavailable ? (
            <Badge dot="warn">Digantikan</Badge>
          ) : null}
          {memory.category ? <Badge>{memory.category}</Badge> : null}
        </div>
        <p
          className={cn(
            "mt-3 max-w-3xl whitespace-pre-wrap text-base leading-6 text-ink-soft",
            unavailable && "text-ink-muted"
          )}
        >
          {memory.content}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
          <span className="flex items-center gap-2">
            {SOURCE_ICONS[memory.source.type]}
            {memory.source.label || SOURCE_LABELS[memory.source.type]}
          </span>
          <time dateTime={memory.updatedAt}>
            Diperbarui {formatDateTime(memory.updatedAt)}
          </time>
        </div>
        {pinMutation.error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {pinMutation.error.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={memory.pinned ? "Lepas sematan" : "Sematkan memori"}
          disabled={pinMutation.isPending || unavailable}
          onClick={() =>
            pinMutation.mutate({ memoryId: memory.id, pinned: !memory.pinned })
          }
        >
          {pinMutation.isPending ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          ) : memory.pinned ? (
            <PinOff />
          ) : (
            <Pin />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Rincian
        </Button>
      </div>
    </li>
  );
}

export function MemoryPage() {
  const [status, setStatus] = useState<MemoryStatus | "all">("active");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Memory | "new" | null>(null);
  const listQuery = useQuery(
    memoriesQueryOptions({ status, pinned: pinnedOnly || undefined })
  );

  const searchQuery = useQuery(memorySearchQueryOptions(search));
  const query = search ? searchQuery : listQuery;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Memori"
        description="Informasi pilihan yang dapat Sydia gunakan kembali—terpisah dari riwayat percakapan dan selalu dapat Anda kendalikan."
        action={
          <Button onClick={() => setEditor("new")}>
            <Plus /> Simpan memori
          </Button>
        }
      />
      <section
        aria-label="Cari dan filter memori"
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]"
      >
        <form className="flex gap-2" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="memory-search">
            Cari memori secara semantik
          </label>
          <Input
            id="memory-search"
            type="search"
            placeholder="Cari berdasarkan arti atau kata kunci"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="dark-outline"
            size="icon"
            aria-label="Cari memori"
          >
            <Search />
          </Button>
        </form>
        <label>
          <span className="sr-only">Status memori</span>
          <SelectField
            value={status}
            disabled={Boolean(search)}
            onChange={(event) =>
              setStatus(event.target.value as MemoryStatus | "all")
            }
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </SelectField>
        </label>
        <Button
          variant="dark-outline"
          className={cn(pinnedOnly && "bg-surface-1 [&_svg]:text-brand")}
          disabled={Boolean(search)}
          onClick={() => setPinnedOnly((value) => !value)}
          aria-pressed={pinnedOnly}
        >
          <Pin /> Disematkan
        </Button>
      </section>
      {search ? (
        <div className="flex items-center justify-between border-y border-surface-1 py-3 text-sm">
          <p>
            Hasil pencarian untuk <strong>“{search}”</strong>
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setSearch("");
              setSearchDraft("");
            }}
          >
            Hapus pencarian
          </Button>
        </div>
      ) : null}
      {query.isPending ? <DomainListSkeleton label="Memuat memori" /> : null}
      {query.isError ? (
        <DomainInlineError
          title={
            search ? "Pencarian memori gagal" : "Memori tidak dapat dimuat"
          }
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && query.data.length === 0 ? (
        <EmptyState
          title={
            search
              ? "Tidak ada memori yang relevan"
              : "Belum ada memori di tampilan ini"
          }
          message={
            search
              ? "Coba ungkapkan pencarian dengan kata lain atau cari topik yang lebih umum."
              : "Simpan informasi penting secara langsung, atau izinkan Sydia memilih informasi berguna dari percakapan."
          }
          action={
            !search ? (
              <Button onClick={() => setEditor("new")}>
                <Plus /> Simpan memori
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {query.isSuccess && query.data.length > 0 ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {query.data.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              onEdit={() => setEditor(memory)}
            />
          ))}
        </ul>
      ) : null}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        {editor ? (
          editor === "new" ? (
            <MemoryEditor key="new" onClose={() => setEditor(null)} />
          ) : (
            <MemoryEditorLoader
              key={editor.id}
              memoryId={editor.id}
              onClose={() => setEditor(null)}
            />
          )
        ) : null}
      </Dialog>
    </div>
  );
}
