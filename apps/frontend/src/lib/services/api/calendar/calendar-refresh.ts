import type { CalendarPollResult, CalendarStatus } from "./calendar.api";

type CalendarRefreshDependencies = {
  requestPoll: (signal: AbortSignal) => Promise<CalendarPollResult>;
  readStatus: (signal: AbortSignal) => Promise<CalendarStatus>;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

const REFRESH_STATUS_ATTEMPTS = 60;
const REFRESH_STATUS_INTERVAL_MS = 1_000;

/** Waits for the worker's incremental pull, bounded to about one minute. */
export async function refreshCalendarOnMount(
  dependencies: CalendarRefreshDependencies,
  signal: AbortSignal
): Promise<
  | { status: "complete"; calendarStatus: CalendarStatus }
  | { status: "cancelled" }
> {
  try {
    const requested = await dependencies.requestPoll(signal);

    for (let attempt = 0; attempt < REFRESH_STATUS_ATTEMPTS; attempt++) {
      signal.throwIfAborted();
      const current = await dependencies.readStatus(signal);

      if (!current.connected || current.calendarId !== requested.calendarId)
        throw new Error(
          "Koneksi kalender berubah. Muat ulang untuk mencoba lagi."
        );
      if (current.lastErrorCode)
        throw new Error(
          "Google Calendar belum dapat disinkronkan. Periksa koneksi di Integrasi lalu muat ulang."
        );

      if (
        requested.status === "fresh" ||
        (current.lastSyncedAt &&
          (!requested.lastSyncedAt ||
            current.lastSyncedAt > requested.lastSyncedAt))
      )
        return { status: "complete", calendarStatus: current };

      if (attempt < REFRESH_STATUS_ATTEMPTS - 1)
        await dependencies.wait(REFRESH_STATUS_INTERVAL_MS, signal);
    }

    throw new Error(
      "Sinkronisasi Google Calendar masih tertunda. Pastikan worker berjalan lalu muat ulang untuk memeriksa kembali."
    );
  } catch (error) {
    // Leaving the page cancels only this observer, not the durable worker job.
    if (signal.aborted) return { status: "cancelled" };
    throw error;
  }
}

export function waitForCalendarStatus(
  milliseconds: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
