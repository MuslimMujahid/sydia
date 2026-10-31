import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireNotePresence,
  getWorkspaceNote,
  releaseNotePresence,
  type WorkspaceNote,
} from "@/lib/services/api/notes/notes.api";

const RENEW_INTERVAL_MS = 30_000;
const RENEW_MARGIN_MS = 60_000;

/** Shared by workspace and chat editors; local drafts survive a lost connection. */
export function useNotePresence(note: WorkspaceNote) {
  const [current, setCurrent] = useState<WorkspaceNote>();
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const connection = useRef<{
    renew: () => Promise<void>;
    expiresAt: number;
  } | null>(null);

  useEffect(() => {
    if (connection.current) setCurrent(note);
  }, [note]);

  useEffect(() => {
    const sessionId = crypto.randomUUID();
    let disposed = false;
    let expiresAt = 0;
    let pending: Promise<void> | undefined;

    const renew = (): Promise<void> => {
      if (pending) return pending;
      pending = (async () => {
        try {
          const reconcile = expiresAt <= Date.now();
          const lease = await acquireNotePresence(note.ref, sessionId);
          const remote = reconcile
            ? await getWorkspaceNote(note.ref)
            : undefined;

          if (disposed) return;
          expiresAt = Date.parse(lease.expiresAt);
          if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
            throw new Error(
              "Perlindungan editor telah kedaluwarsa. Coba lagi."
            );
          if (remote) setCurrent(remote);
          if (connection.current) connection.current.expiresAt = expiresAt;
          setError(undefined);
          setReady(true);
        } catch (failure) {
          expiresAt = 0;
          if (!disposed && connection.current) connection.current.expiresAt = 0;
          console.warn(
            "Editor presence unavailable; saves paused and draft retained.",
            {
              name: failure instanceof Error ? failure.name : "UnknownError",
            }
          );

          if (!disposed) {
            setReady(false);
            setError(
              "Koneksi editor terputus. Draf Anda tetap tersedia. Hubungkan kembali untuk menyimpan."
            );
          }

          throw failure;
        } finally {
          pending = undefined;
        }
      })();

      return pending;
    };

    connection.current = { renew, expiresAt: 0 };

    // renew surfaces failures in the UI and logs; event handlers must settle them.
    const reconnect = () => {
      void renew().catch((failure: unknown) => {
        console.warn("Editor reconnection requires retry.", {
          name: failure instanceof Error ? failure.name : "UnknownError",
        });
      });
    };

    const offline = () => {
      expiresAt = 0;
      if (connection.current) connection.current.expiresAt = 0;
      setReady(false);
      setError("Anda sedang offline. Draf tetap tersedia; penyimpanan dijeda.");
    };

    const visible = () => {
      if (document.visibilityState === "visible") reconnect();
    };

    reconnect();
    const timer = setInterval(reconnect, RENEW_INTERVAL_MS);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);

    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      connection.current = null;

      // Opening may still be in flight. Release only after that request settles.
      const release = async () => {
        if (pending) {
          try {
            await pending;
          } catch (failure) {
            console.warn("Editor closed before protection could be renewed.", {
              name: failure instanceof Error ? failure.name : "UnknownError",
            });
          }
        }

        try {
          await releaseNotePresence(note.ref, sessionId);
        } catch (failure) {
          console.warn(
            "Editor presence release failed; abandoned lease expires within five minutes.",
            {
              name: failure instanceof Error ? failure.name : "UnknownError",
            }
          );
        }
      };

      void release();
    };
  }, [note.ref]);

  const ensure = useCallback(async () => {
    const live = connection.current;
    if (!live) throw new Error("Editor belum terhubung.");
    if (live.expiresAt - Date.now() < RENEW_MARGIN_MS) await live.renew();
  }, []);

  const retry = useCallback(() => {
    void connection.current?.renew().catch((failure: unknown) => {
      console.warn("Editor reconnection failed.", {
        name: failure instanceof Error ? failure.name : "UnknownError",
      });
    });
  }, []);

  return { note: current, ready, error, ensure, retry };
}
