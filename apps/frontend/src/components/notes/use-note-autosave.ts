import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/services/api/api";
import {
  getWorkspaceNote,
  saveWorkspaceNote,
  type NoteDraft,
  type WorkspaceNote,
} from "@/lib/services/api/notes/notes.api";

export type NoteSaveStatus =
  "saved" | "dirty" | "saving" | "error" | "conflict";
type UseNoteAutosaveOptions = {
  note: WorkspaceNote;
  available?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (note: WorkspaceNote) => void;
  onRemote: (note: WorkspaceNote) => void;
};

export function useNoteAutosave({
  note,
  available = true,
  onDirtyChange,
  onSaved,
  onRemote,
}: UseNoteAutosaveOptions) {
  const [status, setStatus] = useState<NoteSaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<WorkspaceNote | null>(null);
  const baseline = useRef(note);
  const draft = useRef<NoteDraft>({ title: note.title, content: note.content });
  const dirty = useRef(false);
  const paused = useRef(false);
  const writing = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onSaved, onRemote, onDirtyChange });
  useEffect(() => {
    callbacks.current = { onSaved, onRemote, onDirtyChange };
  }, [onSaved, onRemote, onDirtyChange]);
  useEffect(() => {
    callbacks.current.onDirtyChange?.(dirty.current);
  }, [status]);

  const flush = useCallback(
    async function flushPending(): Promise<boolean> {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      if (writing.current) {
        if (!(await writing.current)) return false;

        return flushPending();
      }

      if (!available) return !dirty.current;
      if (paused.current) return false;
      if (!dirty.current) return true;
      const captured = draft.current;
      setStatus("saving");

      const work = async () => {
        try {
          const saved = await saveWorkspaceNote(baseline.current, captured);
          baseline.current = saved;
          dirty.current = draft.current !== captured;
          setStatus(dirty.current ? "dirty" : "saved");
          setError(null);
          callbacks.current.onSaved(saved);

          return true;
        } catch (failure) {
          console.warn("Note autosave paused; local draft retained.", failure);

          if (
            failure instanceof ApiClientError &&
            failure.status === 409 &&
            failure.details?.reason === "REVISION"
          ) {
            paused.current = true;
            setStatus("conflict");

            try {
              setConflict(await getWorkspaceNote(note.ref));
              setError(null);
            } catch (readFailure) {
              console.warn(
                "Conflicting note could not be fetched.",
                readFailure
              );
              setError(
                "Versi terbaru belum dapat dimuat. Coba lagi; draf Anda tetap tersedia."
              );
            }
          } else {
            setStatus("error");
            setError(
              failure instanceof Error
                ? failure.message
                : "Perubahan belum tersimpan. Coba lagi."
            );
          }

          return false;
        } finally {
          writing.current = null;
        }
      };

      writing.current = work();
      const succeeded = await writing.current;
      if (succeeded && dirty.current) return flushPending();

      return succeeded;
    },
    [available, note.ref]
  );

  const change = useCallback(
    (next: Partial<NoteDraft>) => {
      draft.current = { ...draft.current, ...next };
      dirty.current = true;
      if (paused.current) return;
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 800);
    },
    [flush]
  );

  useEffect(() => {
    if (!available) {
      if (timer.current) clearTimeout(timer.current);

      if (dirty.current) {
        setStatus("error");
        setError("Catatan tidak tersedia. Salin draf atau buang perubahan.");
      }
    }
  }, [available]);

  useEffect(() => {
    if (note.version === baseline.current.version) return;
    if (writing.current) return;

    if (dirty.current || paused.current) {
      paused.current = true;
      if (timer.current) clearTimeout(timer.current);
      setConflict(note);
      setError(null);
      setStatus("conflict");
    } else {
      baseline.current = note;
      draft.current = { title: note.title, content: note.content };
      callbacks.current.onRemote(note);
    }
  }, [note]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
      // Route navigation awaits flush; the unload guard protects tab closure.
    };
  }, []);

  const resolve = useCallback(
    async (choice: "server" | "draft") => {
      try {
        const latest = await getWorkspaceNote(note.ref);

        if (choice === "server") {
          baseline.current = latest;
          draft.current = { title: latest.title, content: latest.content };
          dirty.current = false;
          paused.current = false;
          setConflict(null);
          setError(null);
          setStatus("saved");
          callbacks.current.onRemote(latest);
          callbacks.current.onSaved(latest);

          return true;
        }

        // Only overwrite the version the user actually compared. A third update
        // reopens comparison rather than silently approving another overwrite.
        if (!conflict || latest.version !== conflict.version) {
          setConflict(latest);
          setError(
            "Catatan berubah lagi. Bandingkan versi terbaru sebelum menyimpan draf."
          );

          return false;
        }

        baseline.current = latest;
        paused.current = false;
        const saved = await flush();
        if (saved) setConflict(null);

        return saved;
      } catch (failure) {
        console.warn(
          "Note conflict resolution failed; local draft retained.",
          failure
        );
        setError("Konflik belum dapat diselesaikan. Coba lagi.");

        return false;
      }
    },
    [conflict, flush, note.ref]
  );

  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    paused.current = false;
    draft.current = {
      title: baseline.current.title,
      content: baseline.current.content,
    };
    setConflict(null);
    setError(null);
    setStatus("saved");
    callbacks.current.onRemote(baseline.current);
  }, []);

  return {
    status,
    error,
    conflict,
    change,
    flush,
    resolve,
    discard,
    draft,
    dirty,
  };
}
