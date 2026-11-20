import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

/**
 * The current time for relative labels ("Hari ini", overdue). It refreshes
 * when the screen regains focus and every minute while it stays focused.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), intervalMs);

      return () => clearInterval(timer);
    }, [intervalMs])
  );

  return now;
}
