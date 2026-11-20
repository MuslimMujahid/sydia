import { useCallback, useEffect, useRef, useState } from "react";

/** How long an undo offer stays open before the delete is sent. */
export const UNDO_WINDOW_MS = 5_000;

/**
 * Undoable deletes without re-creating anything: the item hides at once, and
 * the delete request is only sent once the undo window closes. Leaving the
 * screen sends pending deletes immediately; if the app is killed first, the
 * item simply survives, so nothing is ever lost by mistake.
 */
export function useDelayedDelete(
  commit: (id: string, onSettled: () => void) => void
) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  /** Shows the item again, e.g. after an undo or a failed delete. */
  const release = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setPendingIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);

      return next;
    });
  }, []);

  const undo = useCallback(
    (id: string) => {
      if (timers.current.has(id)) release(id);
    },
    [release]
  );

  const schedule = useCallback(
    (id: string) => {
      setPendingIds((current) => new Set(current).add(id));
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          commitRef.current(id, () => release(id));
        }, UNDO_WINDOW_MS)
      );
    },
    [release]
  );

  useEffect(() => {
    const pending = timers.current;

    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        commitRef.current(id, () => {});
      }
      pending.clear();
    };
  }, []);

  return { pendingIds, schedule, undo };
}
