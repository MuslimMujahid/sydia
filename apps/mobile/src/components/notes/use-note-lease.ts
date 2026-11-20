import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  acquireNotePresence,
  releaseNotePresence,
} from "@/lib/services/api/notes/notes.api";

const RENEW_INTERVAL_MS = 30_000;
const RENEW_MARGIN_MS = 60_000;

type Lease = {
  id: string;
  expiresAt: number;
  pending?: Promise<void>;
  renew: () => Promise<void>;
};

/** Keeps assistant writes out of an active note editor and expires on disconnect. */
export function useNoteLease(ref: string) {
  const state = useRef<Lease | null>(null);
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const lease: Lease = {
        id: Crypto.randomUUID(),
        expiresAt: 0,
        renew: () => {
          if (lease.pending) return lease.pending;

          lease.pending = (async () => {
            try {
              const result = await acquireNotePresence(ref, lease.id);
              const expiresAt = Date.parse(result.expiresAt);
              if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
                throw new Error("Perlindungan editor sudah berakhir.");

              lease.expiresAt = expiresAt;
              if (active) setError(undefined);
            } catch (caught) {
              lease.expiresAt = 0;
              console.warn("Note editor lease could not be renewed", {
                name: caught instanceof Error ? caught.name : "UnknownError",
              });
              if (active)
                setError("Editor belum terhubung. Coba sambungkan kembali.");
              throw caught;
            } finally {
              lease.pending = undefined;
            }
          })();

          return lease.pending;
        },
      };
      state.current = lease;

      function renew() {
        void lease.renew().catch((caught: unknown) => {
          console.warn("Note editor lease renewal requires retry", {
            name: caught instanceof Error ? caught.name : "UnknownError",
          });
        });
      }

      renew();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") renew();
      }, RENEW_INTERVAL_MS);
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active") renew();
      });

      return () => {
        active = false;
        state.current = null;
        clearInterval(timer);
        subscription.remove();
        void (async () => {
          try {
            await lease.pending;
          } catch (caught) {
            console.warn("Pending note editor lease failed while closing", {
              name: caught instanceof Error ? caught.name : "UnknownError",
            });
          }
          try {
            await releaseNotePresence(ref, lease.id);
          } catch (caught) {
            console.warn(
              "Note editor lease could not be released and will expire",
              {
                name: caught instanceof Error ? caught.name : "UnknownError",
              }
            );
          }
        })();
      };
    }, [ref])
  );

  const ensure = useCallback(async () => {
    const lease = state.current;
    if (!lease) throw new Error("Editor belum terhubung.");
    if (lease.expiresAt - Date.now() < RENEW_MARGIN_MS) await lease.renew();
    return lease.id;
  }, []);

  return { ensure, error };
}
