import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
  getRecordMetadata,
  getRecordSavedView,
  getRecordPageCursor,
  mutateRecordNote,
  recordMetadataOptions,
  type RecordChange,
  type RecordColumn,
  type RecordMetadata,
  type RecordPage,
} from "@/lib/services/api/record-notes/record-notes.api";
import {
  notesKeys,
  type WorkspaceNote,
} from "@/lib/services/api/notes/notes.api";
import { useNotePresence } from "./use-note-presence";

type CellDraft = {
  rowId: string;
  columnId: string;
  value: string | boolean | null;
};
type SchemaHistoryEntry = {
  kind: "schema";
  before: RecordColumn[];
  after: RecordColumn[];
};
type CellsHistoryEntry = {
  kind: "cells";
  before: CellDraft[];
  after: CellDraft[];
};
type RemovalHistoryEntry = {
  kind: "removal";
  before: RecordColumn[];
  after: RecordColumn[];
  undoKey: string;
};
type HistoryEntry =
  SchemaHistoryEntry | CellsHistoryEntry | RemovalHistoryEntry;
type HistoryEffect = { direction: "undo" | "redo"; entry: HistoryEntry };
type Pending = {
  revision: number;
  requestKey: string;
  change: RecordChange;
  recordHistory?: boolean;
  history?: HistoryEntry;
  historyEffect?: HistoryEffect;
};

export function useRecordEditor(
  note: WorkspaceNote,
  onSaved: (note: WorkspaceNote) => void,
  onDirtyChange?: (dirty: boolean) => void
) {
  const id = note.ref.slice(7);
  const presence = useNotePresence(note);
  const client = useQueryClient();
  const metaQuery = useQuery({
    ...recordMetadataOptions(id),
    enabled: presence.ready,
  });

  const [meta, setMeta] = useState<RecordMetadata>();
  const current = useRef<RecordMetadata | undefined>(undefined);
  const [page, setPage] = useState<RecordPage>();
  const pageRef = useRef<RecordPage | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<RecordMetadata>();
  const [drafts, setDrafts] = useState<CellDraft[]>([]);
  const draftRef = useRef<CellDraft[]>([]);
  const pending = useRef<Pending | undefined>(undefined);
  const running = useRef<Promise<boolean> | undefined>(undefined);
  const history = useRef<HistoryEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [toast, setToast] = useState<string>();
  const discarded = useRef(false);
  const contextDraft = useRef<{ title?: string; description?: string }>({});
  const [contextDirty, setContextDirty] = useState(false);

  function changeTitle(title: string) {
    contextDraft.current.title = title;
    discarded.current = false;
    setContextDirty(true);
  }

  function changeDescription(description: string) {
    contextDraft.current.description = description;
    discarded.current = false;
    setContextDirty(true);
  }

  const redoHistory = useRef<HistoryEntry[]>([]);
  const [redoCount, setRedoCount] = useState(0);
  const applyingHistory = useRef(false);
  const assignMeta = useCallback((m: RecordMetadata) => {
    current.current = m;
    setMeta(m);
  }, []);

  const assignPage = useCallback((p: RecordPage) => {
    pageRef.current = p;
    setPage(p);
  }, []);

  useEffect(() => {
    if (!presence.ready || !metaQuery.data || current.current) return;
    let disposed = false;
    setLoading(true);
    void getRecordSavedView(id, 0, metaQuery.data)
      .then((view) => {
        if (!disposed) {
          assignMeta(view.metadata);
          assignPage(view.content);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        console.warn("Record content loading failed", {
          name: e instanceof Error ? e.name : "UnknownError",
        });
        if (!disposed)
          setError(
            e instanceof Error ? e.message : "Tabel tidak dapat dimuat."
          );
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [presence.ready, metaQuery.data, id, assignMeta, assignPage]);
  useEffect(() => {
    onDirtyChange?.(drafts.length > 0 || contextDirty || !!error);
  }, [drafts, contextDirty, error, onDirtyChange]);

  const updateDrafts = (next: CellDraft[]) => {
    draftRef.current = next;
    setDrafts(next);
  };

  function changeCell(
    rowId: string,
    columnId: string,
    value: string | boolean | null
  ) {
    discarded.current = false;
    const next = draftRef.current.filter(
      (d) => d.rowId !== rowId || d.columnId !== columnId
    );

    next.push({ rowId, columnId, value });
    updateDrafts(next);
  }

  function cancelCellEdit(
    rowId: string,
    columnId: string,
    previous?: CellDraft
  ) {
    const next = draftRef.current.filter(
      (d) => d.rowId !== rowId || d.columnId !== columnId
    );

    if (pending.current) {
      console.warn(
        "Cell cancellation paused: resolve the uncertain save before discarding its draft."
      );

      return false;
    }

    if (previous) next.push(previous);
    updateDrafts(next);

    return true;
  }

  function recordCellHistory(
    change: RecordChange
  ): CellsHistoryEntry | undefined {
    const updates =
      change.action === "update_rows"
        ? change.rows
        : change.action === "paste_rows" && change.additions.length === 0
          ? change.updates
          : undefined;

    if (!updates) return;
    const before: CellDraft[] = [];
    const after: CellDraft[] = [];

    for (const update of updates) {
      const row = pageRef.current?.rows.find((r) => r.id === update.id);
      if (!row)
        throw new Error(
          "Baris perubahan tidak tersedia. Muat versi terbaru sebelum mengubahnya."
        );

      for (const [columnId, value] of Object.entries(update.values)) {
        const previous = row.cells[columnId]?.raw ?? null;
        if (
          previous === value ||
          (previous !== null && value !== null && previous === String(value))
        )
          continue;
        before.push({ rowId: row.id, columnId, value: previous });
        after.push({ rowId: row.id, columnId, value });
      }
    }

    return before.length ? { kind: "cells", before, after } : undefined;
  }

  function finishHistory(operation: Pending) {
    const effect = operation.historyEffect;

    if (effect) {
      if (effect.direction === "undo") {
        history.current.pop();
        redoHistory.current.push(effect.entry);
      } else {
        redoHistory.current.pop();
        history.current.push(effect.entry);
      }
    } else if (operation.history) {
      history.current.push(operation.history);
      redoHistory.current = [];
    }

    setUndoCount(history.current.length);
    setRedoCount(redoHistory.current.length);
  }

  const commit = async (operation: Pending): Promise<boolean> => {
    try {
      await presence.ensure();
      const sessionId = presence.getSessionId();
      if (!sessionId) throw new Error("Editor belum terhubung.");
      if (operation.recordHistory !== false && !operation.history)
        operation.history = recordCellHistory(operation.change);
      pending.current = operation;
      setBusy(true);
      const result = await mutateRecordNote(id, {
        revision: operation.revision,
        requestKey: operation.requestKey,
        change: operation.change,
        sessionId,
      });

      const view = await getRecordSavedView(
        id,
        pageRef.current?.page.offset ?? 0,
        result
      );

      assignMeta(view.metadata);
      assignPage(view.content);
      setConflict(undefined);
      setError(undefined);
      pending.current = undefined;
      onSaved({
        ...note,
        title: view.metadata.title,
        version: String(view.metadata.revision),
        updatedAt: view.metadata.updatedAt,
      });
      client.setQueryData(recordMetadataOptions(id).queryKey, view.metadata);
      void client.invalidateQueries({ queryKey: notesKeys.workspace });
      const removal = operation.historyEffect?.entry ?? operation.history;
      if (removal?.kind === "removal" && result.undoKey)
        removal.undoKey = result.undoKey;
      finishHistory(operation);
      if (removal?.kind === "removal" && !operation.historyEffect)
        setToast(
          `Kolom “${removal.before.map((c) => c.name).join(", ")}” dihapus`
        );

      return true;
    } catch (e) {
      console.warn("Record save paused; local changes retained.", {
        name: e instanceof Error ? e.name : "UnknownError",
      });
      setError(
        e instanceof Error ? e.message : "Tabel belum tersimpan. Coba lagi."
      );

      return false;
    } finally {
      setBusy(false);
    }
  };

  const flush = async (): Promise<boolean> => {
    if (running.current) return running.current;

    const work = async () => {
      if (discarded.current) return true;

      if (pending.current) {
        const operation = pending.current;
        if (!(await commit(operation))) return false;

        if (operation.change.action === "update_rows") {
          const updates = operation.change.rows;
          updateDrafts(
            draftRef.current.filter(
              (d) =>
                !updates.some(
                  (r) => r.id === d.rowId && r.values[d.columnId] === d.value
                )
            )
          );
        }
      }

      while (draftRef.current.length) {
        const snapshot = [...draftRef.current];
        const byRow = new Map<
          string,
          Record<string, string | boolean | null>
        >();

        for (const d of snapshot) {
          const values = byRow.get(d.rowId) ?? {};
          values[d.columnId] = d.value;
          byRow.set(d.rowId, values);
        }

        if (!current.current) return false;
        const operation = {
          revision: current.current.revision,
          requestKey: crypto.randomUUID(),
          change: {
            action: "update_rows" as const,
            rows: [...byRow].map(([id, values]) => ({ id, values })),
          },
        };

        if (!(await commit(operation))) return false;
        updateDrafts(
          draftRef.current.filter(
            (d) =>
              !snapshot.some(
                (s) =>
                  s.rowId === d.rowId &&
                  s.columnId === d.columnId &&
                  s.value === d.value
              )
          )
        );
      }

      if (!current.current) return !contextDirty;
      const title = contextDraft.current.title;

      if (title !== undefined && title !== current.current.title) {
        if (
          !(await commit({
            revision: current.current.revision,
            requestKey: crypto.randomUUID(),
            change: { action: "title", title },
          }))
        )
          return false;
        if (contextDraft.current.title === title)
          delete contextDraft.current.title;
      }

      const description = contextDraft.current.description;

      if (
        description !== undefined &&
        description !== current.current.description
      ) {
        if (
          !(await commit({
            revision: current.current.revision,
            requestKey: crypto.randomUUID(),
            change: { action: "context", description },
          }))
        )
          return false;
        if (contextDraft.current.description === description)
          delete contextDraft.current.description;
      }

      if (contextDraft.current.title === current.current.title)
        delete contextDraft.current.title;
      if (contextDraft.current.description === current.current.description)
        delete contextDraft.current.description;
      setContextDirty(Object.keys(contextDraft.current).length > 0);

      return true;
    };

    running.current = work();

    try {
      return await running.current;
    } finally {
      running.current = undefined;
    }
  };

  useBlocker({ shouldBlockFn: async () => !(await flush()) });
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (
        draftRef.current.length ||
        contextDraft.current.title !== undefined ||
        contextDraft.current.description !== undefined ||
        pending.current
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", prevent);

    return () => window.removeEventListener("beforeunload", prevent);
  }, []);

  async function mutate(
    change: RecordChange,
    options?: {
      recordHistory?: boolean;
      historyEffect?: HistoryEffect;
      history?: HistoryEntry;
    }
  ) {
    if (!(await flush()) || !current.current) return false;

    return commit({
      revision: current.current.revision,
      requestKey: crypto.randomUUID(),
      change,
      ...options,
    });
  }

  async function schema(
    columns: RecordColumn[],
    label: string,
    confirmed = false,
    undoable = true
  ) {
    const before = current.current?.columns;
    if (!before) return false;
    const removed = before.filter(
      (c) => !columns.some((next) => next.id === c.id)
    );

    const changedBefore = before.filter((c) => {
      const next = columns.find((n) => n.id === c.id);

      return next && JSON.stringify(next) !== JSON.stringify(c);
    });

    const entry: HistoryEntry | undefined = removed.length
      ? { kind: "removal", before: removed, after: [], undoKey: "" }
      : undoable && changedBefore.length
        ? {
            kind: "schema",
            before: changedBefore,
            after: columns.filter((c) =>
              changedBefore.some((old) => old.id === c.id)
            ),
          }
        : undefined;

    const result = await mutate(
      { action: "schema", columns, confirmed },
      { recordHistory: false, history: entry }
    );

    return result;
  }

  async function applyHistory(direction: "undo" | "redo") {
    if (applyingHistory.current) return;
    applyingHistory.current = true;

    try {
      if (!(await flush())) return;
      const entry = (
        direction === "undo" ? history.current : redoHistory.current
      ).at(-1);

      const live = current.current;
      if (!entry || !live) return;
      const target = direction === "undo" ? entry.before : entry.after;
      let change: RecordChange;

      if (entry.kind === "removal") {
        change =
          direction === "undo"
            ? { action: "restore_columns", undoKey: entry.undoKey }
            : {
                action: "schema",
                columns: live.columns.filter(
                  (c) => !entry.before.some((old) => old.id === c.id)
                ),
                confirmed: true,
              };
      } else if (entry.kind === "schema") {
        const definitions = target as RecordColumn[];

        if (
          definitions.some(
            (column) => !live.columns.some((c) => c.id === column.id)
          )
        ) {
          console.warn(
            "Schema undo target is no longer available; saved data retained."
          );
          setError(
            "Kolom yang ingin diurungkan sudah dihapus. Perubahan lain tetap tersedia."
          );

          return;
        }

        const replacements = new Map(
          definitions.map((column) => [column.id, column])
        );

        change = {
          action: "schema",
          confirmed: true,
          columns: live.columns.map(
            (column) => replacements.get(column.id) ?? column
          ),
        };
      } else {
        const byRow = new Map<
          string,
          Record<string, string | boolean | null>
        >();

        for (const cell of target as CellDraft[]) {
          const values = byRow.get(cell.rowId) ?? {};
          values[cell.columnId] = cell.value;
          byRow.set(cell.rowId, values);
        }

        change = {
          action: "update_rows",
          rows: [...byRow].map(([id, values]) => ({ id, values })),
        };
      }

      setToast(undefined);
      await mutate(change, {
        recordHistory: false,
        historyEffect: { direction, entry },
      });
    } finally {
      applyingHistory.current = false;
    }
  }

  const undo = () => applyHistory("undo");
  const redo = () => applyHistory("redo");

  async function navigate(cursor: string) {
    const before = pageRef.current;
    const direction = before
      ? (["first", "last", "next", "previous"] as const).find(
          (key) => before.page[key] === cursor
        )
      : undefined;

    if (!(await flush())) return;

    if (before && pageRef.current?.revision !== before.revision && direction) {
      const freshCursor = pageRef.current?.page[direction];
      if (!freshCursor) return;
      cursor = freshCursor;
    }

    setLoading(true);

    try {
      // Cursor errors are visible; do not silently restart and mix saved revisions.
      assignPage(await getRecordPageCursor(id, cursor));
      setError(undefined);
    } catch (e) {
      console.warn("Record page navigation failed", {
        name: e instanceof Error ? e.name : "UnknownError",
      });
      setError(
        "Halaman tidak dapat dimuat atau tabel berubah. Muat versi terbaru untuk mulai kembali."
      );
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    try {
      const m = await getRecordMetadata(id);

      if (
        draftRef.current.length ||
        contextDraft.current.title !== undefined ||
        contextDraft.current.description !== undefined ||
        pending.current
      ) {
        setConflict(m);

        return;
      }

      const view = await getRecordSavedView(id, 0, m);
      assignMeta(view.metadata);
      assignPage(view.content);
      client.setQueryData(recordMetadataOptions(id).queryKey, view.metadata);
      setError(undefined);
    } catch (e) {
      console.warn("Record refresh failed");
      setError(e instanceof Error ? e.message : "Tabel tidak dapat dimuat.");
    }
  }

  async function rebaseCells() {
    if (!conflict) return;
    const p = pending.current;

    if (p && p.change.action !== "update_rows") {
      setError(
        "Perubahan struktur perlu ditinjau kembali. Salin draf sebelum memakai versi terbaru."
      );

      return;
    }

    pending.current = undefined;
    assignMeta(conflict);
    setConflict(undefined);
    await flush();
  }

  async function saveTitle(title: string) {
    changeTitle(title);

    return flush();
  }

  function discard() {
    discarded.current = true;
    pending.current = undefined;
    updateDrafts([]);
    contextDraft.current = {};
    setContextDirty(false);
    setError(undefined);
    setConflict(undefined);
  }

  return {
    id,
    presence,
    meta,
    page,
    error: error ?? metaQuery.error?.message,
    busy,
    loading: loading || metaQuery.isPending,
    drafts,
    isDirty: drafts.length > 0 || contextDirty,
    changeCell,
    cancelCellEdit,
    flush,
    mutate,
    schema,
    undo,
    undoCount,
    toast,
    setToast,
    navigate,
    refresh,
    conflict,
    rebaseCells,
    saveTitle,
    changeTitle,
    changeDescription,
    redo,
    redoCount,
    discard,
    hasDraft: () =>
      draftRef.current.length > 0 ||
      contextDraft.current.title !== undefined ||
      contextDraft.current.description !== undefined ||
      !!pending.current,
  };
}
