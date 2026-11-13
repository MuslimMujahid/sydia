import { z } from "zod";

const recoverySchema = z.object({
  format: z.literal("record").optional(),
  ref: z.string(),
  requestKey: z.string(),
  text: z.string(),
  draft: z.object({
    title: z.string(),
    content: z.object({
      type: z.literal("doc"),
      content: z.array(z.record(z.string(), z.json())).optional(),
    }),
  }),
});

export type NoteRecovery = z.infer<typeof recoverySchema>;
type RecoverySnapshot = {
  drafts: NoteRecovery[];
  warning: string | null;
};
type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

/** Recovery is scoped to the account and browser tab. If session storage fails,
 * the mounted application's memory retains the draft until the tab is closed. */
export function createNoteRecoveryStore(
  userId: string,
  storage: () => RecoveryStorage
) {
  const key = `sydia:notes:recovery:${userId}`;
  const empty: RecoverySnapshot = { drafts: [], warning: null };
  let snapshot: RecoverySnapshot | undefined;
  const listeners = new Set<() => void>();

  const getSnapshot = (): RecoverySnapshot => {
    if (snapshot) return snapshot;

    try {
      const raw = storage().getItem(key);
      snapshot = {
        drafts:
          raw === null ? [] : z.array(recoverySchema).parse(JSON.parse(raw)),
        warning: null,
      };
    } catch (error) {
      console.warn("Note recovery storage could not be read.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      snapshot = {
        drafts: [],
        warning:
          "Draf pemulihan pada browser ini tidak dapat dimuat. Jangan tutup tab yang masih berisi draf Anda.",
      };
    }

    return snapshot;
  };

  function write(drafts: NoteRecovery[]) {
    let warning: string | null = null;

    try {
      storage().setItem(key, JSON.stringify(drafts));
    } catch (error) {
      console.warn(
        "Note recovery retained in memory; session storage write failed.",
        { name: error instanceof Error ? error.name : "UnknownError" }
      );
      warning =
        "Draf pemulihan hanya tersedia selama tab ini terbuka. Salin atau simpan draf sebelum memuat ulang.";
    }

    snapshot = { drafts, warning };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot,
    getServerSnapshot: () => empty,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    add: (draft: NoteRecovery) =>
      write([
        ...getSnapshot().drafts.filter((value) => value.ref !== draft.ref),
        draft,
      ]),
    remove: (ref: string) =>
      write(getSnapshot().drafts.filter((value) => value.ref !== ref)),
  };
}

// Only populated in the browser: no account data is shared between SSR requests.
const browserStores = new Map<
  string,
  ReturnType<typeof createNoteRecoveryStore>
>();

export function noteRecoveryStore(userId: string) {
  if (typeof window === "undefined")
    return createNoteRecoveryStore(userId, () => {
      throw new Error("Browser storage is unavailable during SSR.");
    });
  let store = browserStores.get(userId);

  if (!store) {
    store = createNoteRecoveryStore(userId, () => window.sessionStorage);
    browserStores.set(userId, store);
    const accountStore = store;
    window.addEventListener("beforeunload", (event) => {
      const snapshot = accountStore.getSnapshot();
      if (!snapshot.warning || snapshot.drafts.length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  return store;
}
