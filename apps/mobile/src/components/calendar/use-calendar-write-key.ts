import { randomUUID } from "expo-crypto";
import { useRef } from "react";

/** Reuse the key for a repeated submission of the same operation until it succeeds. */
export function useCalendarWriteKey() {
  const attempts = useRef(
    new Map<string, { fingerprint: string; key: string }>()
  );

  return {
    keyFor: (action: string, input: unknown) => {
      const fingerprint = JSON.stringify(input);
      const pending = attempts.current.get(action);
      if (pending?.fingerprint === fingerprint) return pending.key;
      const key = randomUUID();
      attempts.current.set(action, { fingerprint, key });

      return key;
    },
    clear: (key: string) => {
      for (const [action, pending] of attempts.current) {
        if (pending.key === key) attempts.current.delete(action);
      }
    },
  };
}
