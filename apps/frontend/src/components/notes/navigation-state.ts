export type NavigationStateResult =
  | { kind: "stored"; ref: string }
  | { kind: "empty" }
  | { kind: "unavailable"; message: string };
type NotesStorage = Pick<Storage, "getItem" | "setItem">;
type NavigationSnapshot = {
  ref: string;
  warning: string | null;
  mounted: boolean;
};

/** A React external store gives SSR a stable initial snapshot, then reads the
 * browser's navigation state after hydration without copying it into effects. */
export function createNotesNavigationStore(userId: string, today: string) {
  const serverSnapshot: NavigationSnapshot = {
    ref: `daily:${today}`,
    warning: null,
    mounted: false,
  };

  let cached: NavigationSnapshot | null = null;
  const listeners = new Set<() => void>();

  return {
    getServerSnapshot: () => serverSnapshot,
    getSnapshot: (): NavigationSnapshot => {
      if (cached) return cached;

      try {
        const saved = readLastNote(window.localStorage, userId);
        cached = {
          ref: saved.kind === "stored" ? saved.ref : `daily:${today}`,
          warning: saved.kind === "unavailable" ? saved.message : null,
          mounted: true,
        };
      } catch (error) {
        console.warn(
          "Notes could not access browser navigation storage; using memory for this workspace session.",
          error
        );
        cached = {
          ref: `daily:${today}`,
          warning: "Navigasi terakhir tidak dapat diingat pada browser ini.",
          mounted: true,
        };
      }

      return cached;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      // Other tabs may update the stored resume target; that must not navigate
      // this tab away from its editor and an unsaved draft. Read it on next mount.
      return () => {
        listeners.delete(listener);
      };
    },
    save: (ref: string, warning: string | null = null) => {
      try {
        warning = storeLastNote(window.localStorage, userId, ref) ?? warning;
      } catch (error) {
        console.warn(
          "Notes navigation storage write unavailable; navigation remains in memory for this session.",
          error
        );
        warning = "Navigasi terakhir hanya diingat selama halaman ini terbuka.";
      }

      cached = { ref, warning, mounted: true };
      for (const listener of listeners) listener();
    },
    clearWarning: () => {
      if (!cached) return;
      cached = { ...cached, warning: null };
      for (const listener of listeners) listener();
    },
  };
}

export function isNoteRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (/^custom:[a-zA-Z0-9_-]+$/.test(value)) return true;
  if (!/^daily:\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = value.slice(6);
  const parsed = new Date(`${date}T12:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

/** Navigation storage degrades to memory for this mounted workspace only.
 * Failure is logged and shown to the user; note content still lives on server. */
export function readLastNote(
  storage: NotesStorage,
  userId: string
): NavigationStateResult {
  try {
    const raw = storage.getItem(`sydia:notes:last:${userId}`);
    if (raw === null) return { kind: "empty" };
    const data: unknown = JSON.parse(raw);
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      data.version !== 1 ||
      !("ref" in data) ||
      !isNoteRef(data.ref)
    )
      throw new Error("Invalid saved notes navigation.");

    return { kind: "stored", ref: data.ref };
  } catch (error) {
    console.warn(
      "Notes navigation storage unavailable; using memory for this workspace session.",
      error
    );

    return {
      kind: "unavailable",
      message:
        "Navigasi sebelumnya tidak dapat dipulihkan. Catatan hari ini dibuka.",
    };
  }
}

export function storeLastNote(
  storage: NotesStorage,
  userId: string,
  ref: string
): string | null {
  try {
    storage.setItem(
      `sydia:notes:last:${userId}`,
      JSON.stringify({ version: 1, ref })
    );

    return null;
  } catch (error) {
    console.warn(
      "Last-opened note could not be persisted; navigation is in memory for this workspace session.",
      error
    );

    return "Navigasi terakhir hanya diingat selama halaman ini terbuka.";
  }
}
