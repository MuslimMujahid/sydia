import { RecordRowSheet } from "./record-row-sheet";
import { RecordDatePicker } from "./record-date-picker";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Redo2,
  Undo2,
  Trash2,
  Copy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceNote } from "@/lib/services/api/notes/notes.api";
import {
  exportRecordNote,
  getRecordCsvDownload,
  type RecordColumn,
  type RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceEditorHandle } from "./workspace-editor";
import { RecordColumnMenu, RECORD_TYPES } from "./record-column-menu";
import { useRecordEditor } from "./use-record-editor";

interface RecordNoteEditorProps {
  note: WorkspaceNote;
  ref?: Ref<WorkspaceEditorHandle>;
  statusSlot: HTMLElement | null;
  onSaved: (note: WorkspaceNote) => void;
  fresh?: boolean;
  presentation?: "workspace" | "drawer";
  onDirtyChange?: (dirty: boolean) => void;
}
type ActiveCell = { rowId: string; columnId: string };

function displayCell(raw: string, column: RecordColumn, typed: boolean) {
  if (!typed) return raw;

  if (column.type === "number") {
    const [whole, fraction] = raw.split(".");

    return (
      new Intl.NumberFormat("id-ID").format(BigInt(whole!)) +
      (fraction ? "," + fraction : "")
    );
  }

  if (column.type === "date")
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${raw}T12:00:00Z`));
  if (column.type === "datetime") return raw.replace("T", " ");

  return raw;
}

export function RecordNoteEditor({
  note,
  ref,
  statusSlot,
  onSaved,
  fresh = false,
  onDirtyChange,
}: RecordNoteEditorProps) {
  const editor = useRecordEditor(note, onSaved, onDirtyChange);
  const [active, setActive] = useState<ActiveCell>();
  const [editing, setEditing] = useState<ActiveCell>();
  const [anchor, setAnchor] = useState<ActiveCell>();
  const [columnMenu, setColumnMenu] = useState<{
    id: string;
    mode: "menu" | "confirm";
  }>();

  const dragging = useRef(false);
  const extending = useRef(false);
  const canceling = useRef(false);
  const finishing = useRef(false);
  const originalDraft = useRef<(typeof editor.drafts)[number] | undefined>(
    undefined
  );

  useEffect(() => {
    const release = () => {
      dragging.current = false;
    };

    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);

    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
    };
  }, []);
  const [renaming, setRenaming] = useState<string>();
  const [columnName, setColumnName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sheetRow, setSheetRow] = useState<string>();
  const [downloadError, setDownloadError] = useState<string>();
  const [pasteError, setPasteError] = useState<string>();
  const [downloading, setDownloading] = useState(false);
  const [toastPaused, setToastPaused] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState<string>();
  const grid = useRef<HTMLTableElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const renameCanceled = useRef(false);
  const meta = editor.meta;
  const page = editor.page;
  const editorReady = Boolean(meta);
  const toast = editor.toast;
  const setToast = editor.setToast;
  const disabled = !editor.presence.ready || editor.busy || !!editor.conflict;
  useImperativeHandle(ref, () => ({
    flush: editor.flush,
    focusTitle: () => titleInput.current?.focus(),
    discard: editor.discard,
    draftText: () =>
      JSON.stringify({ title, description, cells: editor.drafts }),
  }));
  useEffect(() => {
    if (fresh && editorReady) titleInput.current?.focus();
  }, [fresh, editorReady]);
  useEffect(() => {
    if (!toast || toastPaused) return;
    const timer = setTimeout(() => setToast(undefined), 6000);

    return () => clearTimeout(timer);
  }, [toast, toastPaused, setToast]);
  const rows = page?.rows ?? [];
  const hasRows = rows.length > 0;
  const currentRow = rows.find((row) => row.id === sheetRow);

  function draftValue(row: RecordRow, column: RecordColumn) {
    const draft = editor.drafts.find(
      (d) => d.rowId === row.id && d.columnId === column.id
    );

    return draft ? draft.value : (row.cells[column.id]?.raw ?? null);
  }

  function startEdit(row: RecordRow, column: RecordColumn, seed?: string) {
    setActive({ rowId: row.id, columnId: column.id });

    if (window.matchMedia("(max-width: 639px)").matches) {
      setSheetRow(row.id);

      return;
    }

    originalDraft.current = editor.drafts.find(
      (d) => d.rowId === row.id && d.columnId === column.id
    );
    canceling.current = false;
    setAnchor({ rowId: row.id, columnId: column.id });
    if (seed !== undefined && column.type !== "date")
      editor.changeCell(row.id, column.id, seed);
    setEditing({ rowId: row.id, columnId: column.id });
  }

  function focusCell(rowIndex: number, columnIndex: number, extend = false) {
    const row = rows[rowIndex];
    const column = meta?.columns[columnIndex];
    if (!row || !column) return;
    const target = { rowId: row.id, columnId: column.id };
    if (!extend) setAnchor(target);
    setActive(target);
    extending.current = true;
    grid.current
      ?.querySelectorAll("tbody tr[data-record-row]")
      [rowIndex]?.querySelectorAll<HTMLElement>("[data-record-cell]")
      [columnIndex]?.focus();
    extending.current = false;
  }

  function tabCell(rowIndex: number, columnIndex: number, backwards: boolean) {
    if (!meta) return;
    const index =
      rowIndex * meta.columns.length + columnIndex + (backwards ? -1 : 1);

    if (index < 0 || index >= rows.length * meta.columns.length) {
      grid.current
        ?.querySelector<HTMLButtonElement>(
          index < 0 ? "thead button" : "tbody tr:last-child button"
        )
        ?.focus();

      return;
    }

    focusCell(
      Math.floor(index / meta.columns.length),
      index % meta.columns.length
    );
  }

  async function finishEdit() {
    if (canceling.current || finishing.current) return false;
    finishing.current = true;
    const saved = await editor.flush();
    if (saved) setEditing(undefined);
    finishing.current = false;

    return saved;
  }

  const anchorRow = rows.findIndex((r) => r.id === anchor?.rowId);
  const activeRow = rows.findIndex((r) => r.id === active?.rowId);
  const anchorColumn =
    meta?.columns.findIndex((c) => c.id === anchor?.columnId) ?? -1;

  const activeColumn =
    meta?.columns.findIndex((c) => c.id === active?.columnId) ?? -1;

  const inRange = (r: number, c: number) =>
    anchorRow >= 0 &&
    activeRow >= 0 &&
    anchorColumn >= 0 &&
    activeColumn >= 0 &&
    r >= Math.min(anchorRow, activeRow) &&
    r <= Math.max(anchorRow, activeRow) &&
    c >= Math.min(anchorColumn, activeColumn) &&
    c <= Math.max(anchorColumn, activeColumn);

  function clearSelection() {
    if (!meta) return;
    rows.forEach((row, r) =>
      meta.columns.forEach((column, c) => {
        if (inRange(r, c)) editor.changeCell(row.id, column.id, null);
      })
    );
    void editor.flush();
  }

  async function addColumn(index = meta?.columns.length ?? 0) {
    if (!meta) return;
    const id = crypto.randomUUID();
    const columns = [...meta.columns];
    let name = `Kolom ${columns.length + 1}`;
    while (columns.some((c) => c.name === name)) name += " baru";
    columns.splice(index, 0, { id, name, type: "text", required: false });

    if (await editor.schema(columns, "Kolom ditambahkan")) {
      setRenaming(id);
      setColumnName(name);
    }
  }

  async function renameColumn() {
    if (!meta || !renaming || renameCanceled.current) return;
    const name = columnName.trim();

    if (!name) {
      setRenaming(undefined);

      return;
    }

    const old = meta.columns.find((c) => c.id === renaming);

    if (old?.name === name) {
      setRenaming(undefined);

      return;
    }

    if (
      await editor.schema(
        meta.columns.map((c) => (c.id === renaming ? { ...c, name } : c)),
        `Kolom diubah menjadi “${name}”`
      )
    )
      setRenaming(undefined);
  }

  async function changeType(column: RecordColumn, type: RecordColumn["type"]) {
    if (!meta || column.type === type) return;
    await editor.schema(
      meta.columns.map((c) =>
        c.id === column.id
          ? {
              id: c.id,
              name: c.name,
              type,
              required: false,
              ...(type === "choice"
                ? { options: ["Pilihan 1", "Pilihan 2"] }
                : {}),
            }
          : c
      ),
      `Tipe “${column.name}” diubah menjadi ${RECORD_TYPES.find((t) => t.value === type)!.label.toLowerCase()}`
    );
  }

  async function moveColumn(index: number, direction: -1 | 1) {
    if (!meta) return;
    const columns = [...meta.columns];
    const [col] = columns.splice(index, 1);
    if (col) columns.splice(index + direction, 0, col);
    await editor.schema(columns, "Urutan kolom diubah");
  }

  async function addRow(
    values: Record<string, string | boolean | null> = {},
    beforeId?: string,
    afterId?: string
  ) {
    if (
      await editor.mutate({
        action: "add_rows",
        rows: [{ values }],
        beforeId,
        afterId,
      })
    ) {
      setEditing(undefined);
      setSelected([]);
    }
  }

  async function removeRows(ids = selected) {
    if (!ids.length) return;

    if (await editor.mutate({ action: "delete_rows", ids })) {
      setSelected([]);
      setSheetRow(undefined);
    }
  }

  async function clearRows(ids = selected) {
    if (!meta || !ids.length) return;
    await editor.mutate({
      action: "update_rows",
      rows: ids.map((id) => ({
        id,
        values: Object.fromEntries(meta.columns.map((c) => [c.id, null])),
      })),
    });
  }

  async function duplicateRows(ids = selected) {
    const selectedRows = rows.filter((r) => ids.includes(r.id));
    await editor.mutate({
      action: "add_rows",
      rows: selectedRows.map((r) => ({
        values: Object.fromEntries(
          Object.entries(r.cells).map(([id, c]) => [id, c.raw])
        ),
      })),
    });
  }

  async function download() {
    setDownloading(true);

    try {
      const saved = await exportRecordNote(editor.id);
      const anchor = document.createElement("a");
      const file = await getRecordCsvDownload(saved.url);
      const objectUrl = URL.createObjectURL(file);
      anchor.href = objectUrl;
      anchor.download = saved.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloadError(undefined);
    } catch (error) {
      console.warn("Record CSV export failed");
      setDownloadError(
        error instanceof Error
          ? error.message
          : "CSV belum dapat diunduh. Coba lagi."
      );
    } finally {
      setDownloading(false);
    }
  }

  async function paste(text: string, rowIndex: number, columnIndex: number) {
    if (!meta) return;
    const values = text
      .replace(/\r\n/g, "\n")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.split("\t"));

    if (values.length > 200) {
      setPasteError("Tempel paling banyak 200 baris sekaligus.");

      return;
    }

    const updates: Array<{
      id: string;
      values: Record<string, string | null>;
    }> = [];

    const additions: Array<{ values: Record<string, string | null> }> = [];

    for (let r = 0; r < values.length; r++) {
      const row = rows[rowIndex + r];
      const cells: Record<string, string | null> = {};

      for (let c = 0; c < values[r]!.length; c++) {
        const column = meta.columns[columnIndex + c];

        if (!column) {
          setPasteError(
            "Data tempelan melebihi jumlah kolom. Tambahkan kolom terlebih dahulu."
          );

          return;
        }

        cells[column.id] = values[r]![c]!;
      }

      if (row) updates.push({ id: row.id, values: cells });
      else additions.push({ values: cells });
    }

    // A single user paste is one atomic operation, including newly appended rows.
    if (await editor.mutate({ action: "paste_rows", updates, additions }))
      setPasteError(undefined);
  }

  const status = editor.busy
    ? "Menyimpan…"
    : editor.error || editor.presence.error
      ? "Belum tersimpan"
      : editor.isDirty
        ? "Perubahan belum tersimpan"
        : "Tersimpan";

  const statusNode = (
    <span
      role="status"
      className="flex items-center gap-2 text-xs text-ink-muted"
    >
      {status === "Tersimpan" ? (
        <Check className="size-3.5" />
      ) : (
        <AlertTriangle className="size-3.5" />
      )}
      {status}
    </span>
  );

  return (
    <div
      className="relative flex min-h-full min-w-0 flex-col [--color-brand:#BE2F6D] [--destructive:#c0362c]"
      onKeyDown={(event) => {
        if (
          !(event.ctrlKey || event.metaKey) ||
          event.altKey ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          (event.target instanceof HTMLElement &&
            event.target.isContentEditable)
        )
          return;
        const key = event.key.toLowerCase();
        if (key !== "z" && key !== "y") return;
        event.preventDefault();
        void (
          key === "y" || event.shiftKey ? editor.redo() : editor.undo()
        ).then(() => {
          requestAnimationFrame(() => {
            if (document.activeElement === document.body)
              grid.current?.parentElement?.focus();
          });
        });
      }}
    >
      {statusSlot ? createPortal(statusNode, statusSlot) : null}
      {editor.presence.error ? (
        <div className="px-8 py-3 text-sm" role="alert">
          {editor.presence.error}
          <Button variant="ghost" size="sm" onClick={editor.presence.retry}>
            Hubungkan kembali
          </Button>
        </div>
      ) : null}
      {editor.error ? (
        <div
          role="alert"
          className="space-y-2 border-b border-ink/8 bg-background px-6 py-4 text-sm"
        >
          <p className="font-semibold">
            {meta ? "Perubahan belum tersimpan" : "Tabel tidak dapat dimuat"}
          </p>
          <p>{editor.error}</p>
          {meta ? (
            <>
              <p className="text-xs text-ink-muted">
                Draf Anda tetap tersedia. Perubahan Sydia menunggu sampai tabel
                ditutup.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="dark-outline"
                  size="sm"
                  onClick={() => void editor.flush()}
                >
                  Coba simpan lagi
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void editor.refresh()}
                >
                  Bandingkan versi terbaru
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {downloadError ? (
        <div
          role="alert"
          className="space-y-2 border-b border-ink/8 bg-background px-6 py-4 text-sm"
        >
          <p className="font-semibold">CSV belum dapat diunduh</p>
          <p>{downloadError}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="dark-outline"
              disabled={downloading}
              onClick={() => void download()}
            >
              Unduh ulang CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDownloadError(undefined)}
            >
              Tutup
            </Button>
          </div>
        </div>
      ) : null}
      {pasteError ? (
        <div
          role="alert"
          className="flex items-start gap-3 border-b border-ink/8 px-6 py-4 text-sm"
        >
          <p className="flex-1">{pasteError}</p>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Tutup kesalahan tempelan"
            onClick={() => setPasteError(undefined)}
          >
            <X />
          </Button>
        </div>
      ) : null}
      {editor.conflict ? (
        <div
          role="alert"
          className="space-y-3 border-b border-ink/8 px-8 py-4 text-sm"
        >
          <p className="font-semibold">
            Tabel telah berubah. Draf Anda tetap disimpan.
          </p>
          <p>
            Versi terbaru: {editor.conflict.title} · {editor.conflict.rowCount}{" "}
            baris. Hanya perubahan sel Anda yang akan diterapkan pada versi
            terbaru.
          </p>
          <Button size="sm" onClick={() => void editor.rebaseCells()}>
            Terapkan perubahan sel saya
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              editor.discard();
              void editor.refresh();
            }}
          >
            Gunakan versi terbaru
          </Button>
        </div>
      ) : null}
      {!meta || !page ? (
        <div
          className="space-y-6 px-6 py-8 sm:px-8"
          aria-busy={editor.loading}
          aria-label="Memuat tabel"
        >
          <div className="h-10 w-2/3 animate-pulse rounded-sm bg-surface-1" />
          <div className="h-60 animate-pulse rounded-sm bg-surface-1" />
          {!editor.loading ? (
            <Button
              onClick={() => void editor.refresh()}
              variant="dark-outline"
            >
              Coba lagi
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1 px-4 pt-6 pb-10 sm:px-8">
            <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row">
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1">
                <input
                  id="note-title"
                  ref={titleInput}
                  aria-label="Judul catatan"
                  className="block w-full min-w-0 rounded-sm bg-transparent p-0 font-display text-[26px] leading-tight font-normal tracking-[-0.03em] outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-brand/30 sm:text-[28px]"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    editor.changeTitle(e.target.value);
                  }}
                  onBlur={() => void editor.saveTitle(title)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
                <textarea
                  aria-label="Deskripsi catatan"
                  rows={1}
                  placeholder="Tambahkan deskripsi…"
                  className="block max-h-28 w-full resize-none [field-sizing:content] rounded-none border-b-2 border-transparent bg-transparent px-0 pt-0 pb-1 text-sm leading-5 text-ink-muted outline-none focus:border-ink-muted focus:text-ink sm:text-[13px]"
                  value={description ?? meta.description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    editor.changeDescription(e.target.value);
                  }}
                  onBlur={() => void editor.flush()}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Urungkan perubahan"
                  title="Urungkan (Ctrl+Z)"
                  disabled={disabled || editor.undoCount === 0}
                  onClick={() =>
                    void editor
                      .undo()
                      .then(() =>
                        requestAnimationFrame(() =>
                          grid.current?.parentElement?.focus()
                        )
                      )
                  }
                >
                  <Undo2 />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Ulangi perubahan"
                  title="Ulangi (Ctrl+Shift+Z / Ctrl+Y)"
                  disabled={disabled || editor.redoCount === 0}
                  onClick={() => void editor.redo()}
                >
                  <Redo2 />
                </Button>
                <Button
                  size="sm"
                  variant="dark-outline"
                  className="ml-2 h-11 min-h-11 rounded-sm sm:h-9 sm:min-h-9"
                  disabled={downloading}
                  onClick={() => void download()}
                >
                  <Download />
                  <span className="hidden sm:inline">Unduh CSV</span>
                  <span className="sm:hidden">CSV</span>
                </Button>
              </div>
            </div>
            {selected.length ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="mr-2 font-semibold">
                  {selected.length} baris dipilih
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void clearRows()}
                >
                  Kosongkan isi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void duplicateRows()}
                >
                  Duplikat
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void removeRows()}
                >
                  <Trash2 />
                  Hapus baris
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Batalkan pilihan"
                  onClick={() => setSelected([])}
                >
                  <X />
                </Button>
              </div>
            ) : null}
            <div
              className="max-w-full overflow-auto rounded-sm border border-ink/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Tabel catatan"
              tabIndex={0}
            >
              <table
                ref={grid}
                role="grid"
                aria-multiselectable="true"
                aria-label={meta.title}
                aria-rowcount={meta.rowCount + 1}
                className="w-full table-fixed border-collapse text-[13px] tabular-nums"
                style={{
                  minWidth: Math.max(
                    480,
                    (hasRows ? 44 : 0) +
                      meta.columns.reduce(
                        (sum, c) =>
                          sum +
                          (c.type === "text"
                            ? 192
                            : c.type === "boolean"
                              ? 76
                              : c.type === "number"
                                ? c.unit
                                  ? 132
                                  : 92
                                : 120),
                        0
                      ) +
                      36
                  ),
                }}
              >
                <colgroup>
                  {hasRows ? <col style={{ width: 44 }} /> : null}
                  {meta.columns.map((c, index) => (
                    <col
                      key={c.id}
                      style={{
                        width:
                          index === 0
                            ? undefined
                            : c.type === "text"
                              ? 192
                              : c.type === "boolean"
                                ? 76
                                : c.type === "number"
                                  ? c.unit
                                    ? 132
                                    : 92
                                  : 120,
                      }}
                    />
                  ))}
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead className="sticky top-0 z-20 bg-background">
                  <tr className="h-9">
                    {hasRows ? (
                      <th className="sticky left-0 z-30 border-r border-b border-ink/8 bg-background">
                        <button
                          aria-label="Pilih semua baris halaman ini"
                          className="block h-[35px] w-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          onClick={() =>
                            setSelected(
                              selected.length === rows.length
                                ? []
                                : rows.map((r) => r.id)
                            )
                          }
                        />
                      </th>
                    ) : null}
                    {meta.columns.map((column, index) => (
                      <th
                        key={column.id}
                        scope="col"
                        style={
                          columnMenu?.id === column.id &&
                          columnMenu.mode === "confirm"
                            ? {
                                boxShadow:
                                  "inset 1.5px 0 var(--destructive), inset -1.5px 0 var(--destructive), inset 0 1.5px var(--destructive)",
                              }
                            : undefined
                        }
                        className={cn(
                          "relative h-9 border-r border-b border-ink/8 p-0 text-left font-semibold",
                          index === 0 && "sticky z-20 bg-background",
                          index === 0 && (hasRows ? "left-11" : "left-0"),
                          (active?.columnId === column.id ||
                            columnMenu?.id === column.id) &&
                            "bg-brand/10 text-brand [&_svg]:text-brand"
                        )}
                      >
                        {renaming === column.id ? (
                          <input
                            aria-label={`Nama kolom ${column.name}`}
                            autoFocus
                            className="h-[35px] w-full bg-canvas px-2.5 text-base outline-2 -outline-offset-2 outline-brand sm:text-xs"
                            value={columnName}
                            onChange={(e) => setColumnName(e.target.value)}
                            onBlur={() => void renameColumn()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void renameColumn();
                              }

                              if (e.key === "Escape") {
                                renameCanceled.current = true;
                                setRenaming(undefined);
                              }
                            }}
                          />
                        ) : (
                          <RecordColumnMenu
                            column={column}
                            onHighlightChange={(mode) =>
                              setColumnMenu((current) =>
                                mode
                                  ? { id: column.id, mode }
                                  : current?.id === column.id
                                    ? undefined
                                    : current
                              )
                            }
                            index={index}
                            total={meta.columns.length}
                            disabled={disabled}
                            onRename={() => {
                              renameCanceled.current = false;
                              setRenaming(column.id);
                              setColumnName(column.name);
                            }}
                            onType={(type) => void changeType(column, type)}
                            onRemove={() =>
                              void editor
                                .schema(
                                  meta.columns.filter(
                                    (c) => c.id !== column.id
                                  ),
                                  `Kolom “${column.name}” dihapus`,
                                  true,
                                  false
                                )
                                .then((saved) => {
                                  if (saved)
                                    requestAnimationFrame(() =>
                                      grid.current?.parentElement?.focus()
                                    );
                                })
                            }
                            onInsert={(side) =>
                              void addColumn(index + (side === "right" ? 1 : 0))
                            }
                            onMove={(d) => void moveColumn(index, d)}
                            onSort={(direction) =>
                              void editor.mutate({
                                action: "sort_rows",
                                columnId: column.id,
                                direction,
                              })
                            }
                            onConfigure={(settings) =>
                              void editor.schema(
                                meta.columns.map((c) =>
                                  c.id === column.id ? { ...c, ...settings } : c
                                ),
                                "Pengaturan kolom diubah"
                              )
                            }
                          />
                        )}
                      </th>
                    ))}
                    <th className="h-9 border-b border-ink/8 p-0">
                      <button
                        aria-label="Tambah kolom"
                        disabled={disabled || meta.columns.length >= 64}
                        className="grid h-9 w-full place-items-center text-ink-muted outline-none hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-brand"
                        onClick={() => void addColumn()}
                      >
                        <Plus className="size-4" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      data-record-row
                      key={row.id}
                      aria-selected={selected.includes(row.id)}
                      className="group h-9"
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 border-r border-b border-ink/8 bg-background p-0 text-center text-xs text-ink-muted",
                          selected.includes(row.id) && "bg-brand/10 text-brand"
                        )}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Tindakan baris ${page.page.offset + rowIndex + 1}`}
                            className="block h-[35px] w-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            onClick={(event) =>
                              setSelected((previous) =>
                                event.ctrlKey || event.metaKey
                                  ? previous.includes(row.id)
                                    ? previous.filter((id) => id !== row.id)
                                    : [...previous, row.id]
                                  : event.shiftKey && previous.length
                                    ? rows
                                        .slice(
                                          Math.min(
                                            rows.findIndex(
                                              (r) => r.id === previous[0]
                                            ),
                                            rowIndex
                                          ),
                                          Math.max(
                                            rows.findIndex(
                                              (r) => r.id === previous[0]
                                            ),
                                            rowIndex
                                          ) + 1
                                        )
                                        .map((r) => r.id)
                                    : [row.id]
                              )
                            }
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.currentTarget.click();
                            }}
                          >
                            {page.page.offset + rowIndex + 1}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => setSheetRow(row.id)}
                            >
                              Ubah baris
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void addRow({}, row.id)}
                            >
                              <Plus />
                              Sisipkan baris di atas
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void addRow({}, undefined, row.id)}
                            >
                              <Plus />
                              Sisipkan baris di bawah
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void duplicateRows([row.id])}
                            >
                              <Copy />
                              Duplikat baris
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void clearRows([row.id])}
                            >
                              Kosongkan isi
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              onClick={() => void removeRows([row.id])}
                            >
                              <Trash2 />
                              Hapus baris
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      {meta.columns.map((column, columnIndex) => {
                        const cell = row.cells[column.id];
                        const draft = editor.drafts.find(
                          (d) => d.rowId === row.id && d.columnId === column.id
                        );

                        const raw = draft
                          ? String(draft.value ?? "")
                          : (cell?.raw ?? "");

                        const mismatch =
                          cell?.status === "mismatched" && !draft;

                        const isEditing =
                          editing?.rowId === row.id &&
                          editing.columnId === column.id;

                        const isActive =
                          active?.rowId === row.id &&
                          active.columnId === column.id;

                        const label = `${column.name}, baris ${page.page.offset + rowIndex + 1}`;

                        return (
                          <td
                            key={column.id}
                            role="gridcell"
                            data-record-cell
                            aria-label={label}
                            aria-describedby={
                              mismatch ? "record-mismatch-help" : undefined
                            }
                            aria-invalid={mismatch || undefined}
                            aria-selected={
                              columnMenu
                                ? columnMenu.id === column.id
                                : inRange(rowIndex, columnIndex)
                            }
                            style={
                              columnMenu?.id === column.id &&
                              columnMenu.mode === "confirm"
                                ? {
                                    boxShadow: `inset 1.5px 0 var(--destructive), inset -1.5px 0 var(--destructive)${rowIndex === rows.length - 1 ? ", inset 0 -1.5px var(--destructive)" : ""}`,
                                  }
                                : undefined
                            }
                            tabIndex={
                              isActive ||
                              ((activeRow < 0 || activeColumn < 0) &&
                                rowIndex === 0 &&
                                columnIndex === 0)
                                ? 0
                                : -1
                            }
                            className={cn(
                              "relative h-9 border-r border-b border-ink/8 bg-canvas p-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand select-none",
                              columnIndex === 0 && "sticky left-11 z-10",
                              isActive &&
                                "z-20 outline-2 outline-solid -outline-offset-2 outline-brand",
                              inRange(rowIndex, columnIndex) && "bg-brand/10",
                              selected.includes(row.id) && "bg-brand/5",
                              mismatch && "bg-amber-50",
                              columnMenu?.id === column.id &&
                                (columnMenu.mode === "confirm"
                                  ? "bg-destructive/5"
                                  : "bg-brand/5")
                            )}
                            onFocus={(event) => {
                              if (event.target !== event.currentTarget) return;
                              const target = {
                                rowId: row.id,
                                columnId: column.id,
                              };

                              setActive(target);
                              if (!extending.current) setAnchor(target);
                            }}
                            onPointerDown={(event) => {
                              if (
                                event.pointerType !== "mouse" ||
                                event.button !== 0 ||
                                editing ||
                                (event.target as HTMLElement).closest(
                                  "input"
                                ) ||
                                (column.type !== "date" &&
                                  (event.target as HTMLElement).closest(
                                    "button"
                                  ))
                              )
                                return;
                              event.preventDefault();
                              dragging.current = true;
                              focusCell(
                                rowIndex,
                                columnIndex,
                                event.shiftKey && !!anchor
                              );
                            }}
                            onPointerEnter={(event) => {
                              if (dragging.current && event.buttons === 1)
                                focusCell(rowIndex, columnIndex, true);
                            }}
                            onCopy={(event) => {
                              if (editing || !meta) return;
                              event.preventDefault();
                              event.clipboardData.setData(
                                "text/plain",
                                rows
                                  .flatMap((r, ri) => {
                                    const values = meta.columns.flatMap(
                                      (c, ci) =>
                                        inRange(ri, ci)
                                          ? [String(draftValue(r, c) ?? "")]
                                          : []
                                    );

                                    return values.length
                                      ? [values.join("\t")]
                                      : [];
                                  })
                                  .join("\n")
                              );
                            }}
                            onDoubleClick={() => startEdit(row, column)}
                            onClick={() => {
                              if (
                                window.matchMedia("(max-width: 639px)").matches
                              )
                                setSheetRow(row.id);
                            }}
                            onPaste={(event) => {
                              if (
                                event.target !== event.currentTarget &&
                                editing
                              )
                                return;
                              event.preventDefault();
                              void paste(
                                event.clipboardData.getData("text"),
                                rowIndex,
                                columnIndex
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) return;

                              if (event.key === "Enter" || event.key === "F2") {
                                event.preventDefault();
                                startEdit(row, column);
                              } else if (
                                event.key === "Delete" ||
                                event.key === "Backspace"
                              ) {
                                event.preventDefault();
                                clearSelection();
                              } else if (event.key === "Tab") {
                                event.preventDefault();
                                tabCell(rowIndex, columnIndex, event.shiftKey);
                              } else if (
                                [
                                  "ArrowDown",
                                  "ArrowUp",
                                  "ArrowLeft",
                                  "ArrowRight",
                                ].includes(event.key)
                              ) {
                                event.preventDefault();
                                focusCell(
                                  Math.max(
                                    0,
                                    Math.min(
                                      rows.length - 1,
                                      rowIndex +
                                        (event.key === "ArrowDown"
                                          ? 1
                                          : event.key === "ArrowUp"
                                            ? -1
                                            : 0)
                                    )
                                  ),
                                  Math.max(
                                    0,
                                    Math.min(
                                      meta.columns.length - 1,
                                      columnIndex +
                                        (event.key === "ArrowRight"
                                          ? 1
                                          : event.key === "ArrowLeft"
                                            ? -1
                                            : 0)
                                    )
                                  ),
                                  event.shiftKey
                                );
                              } else if (
                                event.key.length === 1 &&
                                !event.metaKey &&
                                !event.ctrlKey &&
                                !event.altKey
                              ) {
                                event.preventDefault();
                                startEdit(row, column, event.key);
                              }
                            }}
                          >
                            {column.type === "date" ? (
                              <RecordDatePicker
                                label={label}
                                value={raw}
                                open={isEditing}
                                disabled={disabled}
                                cell
                                onOpenChange={(open) => {
                                  if (open) {
                                    if (
                                      anchor &&
                                      active &&
                                      (anchor.rowId !== active.rowId ||
                                        anchor.columnId !== active.columnId)
                                    )
                                      return;
                                    startEdit(row, column);
                                  } else setEditing(undefined);
                                }}
                                onChange={(date) => {
                                  editor.changeCell(
                                    row.id,
                                    column.id,
                                    date || null
                                  );
                                  void finishEdit();
                                }}
                              />
                            ) : isEditing ? (
                              <input
                                aria-label={label}
                                autoFocus
                                disabled={disabled}
                                list={
                                  column.type === "choice"
                                    ? `options-${column.id}`
                                    : undefined
                                }
                                value={raw}
                                className="h-[35px] w-full bg-canvas px-2.5 text-[13px] outline-none"
                                onChange={(e) =>
                                  editor.changeCell(
                                    row.id,
                                    column.id,
                                    e.target.value
                                  )
                                }
                                onBlur={() => void finishEdit()}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === "Tab"
                                  ) {
                                    event.preventDefault();
                                    const key = event.key;
                                    const backwards = event.shiftKey;
                                    void finishEdit().then((saved) => {
                                      if (!saved) return;
                                      if (key === "Tab")
                                        tabCell(
                                          rowIndex,
                                          columnIndex,
                                          backwards
                                        );
                                      else
                                        focusCell(
                                          Math.max(
                                            0,
                                            Math.min(
                                              rows.length - 1,
                                              rowIndex + (backwards ? -1 : 1)
                                            )
                                          ),
                                          columnIndex
                                        );
                                    });
                                  }

                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    if (
                                      !editor.cancelCellEdit(
                                        row.id,
                                        column.id,
                                        originalDraft.current
                                      )
                                    )
                                      return;
                                    canceling.current = true;
                                    setEditing(undefined);
                                    focusCell(rowIndex, columnIndex);
                                  }
                                }}
                              />
                            ) : column.type === "boolean" && !mismatch ? (
                              <div className="grid h-[35px] place-items-center">
                                <button
                                  disabled={disabled}
                                  role="checkbox"
                                  aria-checked={
                                    raw === "" ? "mixed" : raw === "true"
                                  }
                                  aria-label={label}
                                  title={
                                    raw === ""
                                      ? "Kosong"
                                      : raw === "true"
                                        ? "Benar"
                                        : "Salah"
                                  }
                                  className={cn(
                                    "grid size-4 place-items-center rounded-[4px] border text-white outline-none focus-visible:ring-2 focus-visible:ring-brand",
                                    raw === "true"
                                      ? "border-brand bg-brand"
                                      : "border-ink/25 bg-canvas",
                                    raw === "" && "border-dashed"
                                  )}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    focusCell(rowIndex, columnIndex);
                                    editor.changeCell(
                                      row.id,
                                      column.id,
                                      raw === ""
                                        ? true
                                        : raw === "true"
                                          ? false
                                          : null
                                    );
                                    void editor.flush();
                                  }}
                                >
                                  {raw === "true" ? (
                                    <Check className="size-3.5" />
                                  ) : null}
                                </button>
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  "flex h-[35px] min-w-0 items-center gap-1.5 px-2.5",
                                  column.type === "number" &&
                                    "justify-end text-right"
                                )}
                              >
                                <span
                                  className={cn(
                                    "truncate",
                                    column.type === "choice" &&
                                      raw &&
                                      !mismatch &&
                                      "rounded-full px-2 py-0.5 text-xs",
                                    column.type === "choice" &&
                                      raw &&
                                      !mismatch &&
                                      [
                                        "bg-blue-50 text-blue-700",
                                        "bg-emerald-50 text-emerald-800",
                                        "bg-amber-50 text-amber-800",
                                      ][
                                        Math.max(
                                          0,
                                          column.options?.indexOf(raw) ?? 0
                                        ) % 3
                                      ]
                                  )}
                                >
                                  {displayCell(
                                    raw,
                                    column,
                                    !!cell && cell.status === "typed" && !draft
                                  )}
                                </span>
                                {mismatch ? (
                                  <AlertTriangle
                                    aria-label="Tidak cocok dengan tipe kolom"
                                    className="ml-auto size-3.5 shrink-0 text-amber-700"
                                  />
                                ) : null}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-b border-ink/8" />
                    </tr>
                  ))}
                  <tr>
                    <td
                      colSpan={meta.columns.length + (hasRows ? 2 : 1)}
                      className="p-0"
                    >
                      <button
                        aria-label="Baris baru"
                        disabled={disabled}
                        className="grid h-8 w-full place-items-center text-ink-muted outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-brand sm:h-7"
                        onClick={() => void addRow()}
                      >
                        <Plus aria-hidden="true" className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p id="record-mismatch-help" className="sr-only">
              Nilai tidak cocok dengan tipe kolom. Input asli tetap disimpan dan
              tidak ikut dihitung.
            </p>
            <div className="mt-4 flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>
                Baris {page.page.from}–{page.page.to} dari {meta.rowCount}
              </span>
              <div className="flex items-center gap-1">
                {[
                  {
                    label: "Halaman pertama",
                    cursor: page.page.first,
                    icon: ChevronFirst,
                    enabled: !!page.page.previous,
                  },
                  {
                    label: "Halaman sebelumnya",
                    cursor: page.page.previous,
                    icon: ChevronLeft,
                    enabled: !!page.page.previous,
                  },
                  {
                    label: "Halaman berikutnya",
                    cursor: page.page.next,
                    icon: ChevronRight,
                    enabled: !!page.page.next,
                  },
                  {
                    label: "Halaman terakhir",
                    cursor: page.page.last,
                    icon: ChevronLast,
                    enabled: !!page.page.next,
                  },
                ].map((p) => (
                  <Button
                    key={p.label}
                    variant="dark-outline"
                    size="icon-sm"
                    className="size-8 min-h-8 min-w-8 rounded-sm"
                    aria-label={p.label}
                    disabled={!p.enabled || editor.loading || editor.busy}
                    onClick={() => p.cursor && void editor.navigate(p.cursor)}
                  >
                    <p.icon />
                  </Button>
                ))}
              </div>
            </div>
            {meta.columns.map((c) =>
              c.type === "choice" ? (
                <datalist id={`options-${c.id}`} key={c.id}>
                  {c.options?.map((v) => (
                    <option value={v} key={v} />
                  ))}
                </datalist>
              ) : null
            )}
          </div>
          <RecordRowSheet
            row={currentRow}
            rowNumber={
              currentRow ? rows.indexOf(currentRow) + 1 + page.page.offset : 0
            }
            title={meta.title}
            columns={meta.columns}
            busy={editor.busy}
            previousAvailable={!!currentRow && rows.indexOf(currentRow) > 0}
            nextAvailable={
              !!currentRow && rows.indexOf(currentRow) < rows.length - 1
            }
            value={(column) =>
              currentRow ? draftValue(currentRow, column) : null
            }
            onChange={(columnId, value) => {
              if (currentRow) editor.changeCell(currentRow.id, columnId, value);
            }}
            onFinish={async () => {
              if (await editor.flush()) setSheetRow(undefined);
            }}
            onDelete={() => {
              if (currentRow) void removeRows([currentRow.id]);
            }}
            onPrevious={async () => {
              if (currentRow && (await editor.flush()))
                setSheetRow(rows[rows.indexOf(currentRow) - 1]?.id);
            }}
            onNext={async () => {
              if (currentRow && (await editor.flush()))
                setSheetRow(rows[rows.indexOf(currentRow) + 1]?.id);
            }}
          />
        </>
      )}
      {editor.toast ? (
        <div
          role="status"
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          onFocus={() => setToastPaused(true)}
          onBlur={() => setToastPaused(false)}
          className="fixed right-5 bottom-16 z-40 flex max-w-[calc(100vw-40px)] items-center gap-4 rounded-md border border-ink/8 bg-canvas px-4 py-3 text-sm shadow-card"
        >
          <Check className="size-4 shrink-0 text-brand" />
          <span>{editor.toast}</span>
          <button
            className="shrink-0 font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand"
            onClick={() =>
              void editor
                .undo()
                .then(() =>
                  requestAnimationFrame(() =>
                    grid.current?.parentElement?.focus()
                  )
                )
            }
          >
            Urungkan
          </button>
          <button
            aria-label="Tutup pemberitahuan"
            onClick={() => editor.setToast(undefined)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
