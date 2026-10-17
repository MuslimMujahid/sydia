import { useState, useSyncExternalStore } from "react";

type FileView = "list" | "grid";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);

  return () => window.removeEventListener("storage", listener);
}

export function useFileLibraryView(userId?: string) {
  const key = userId ? `sydia:files:view:${userId}` : undefined;
  const [session, setSession] = useState<{
    key: string | undefined;
    view: FileView;
  }>();

  const stored = useSyncExternalStore(
    subscribe,
    (): FileView => {
      if (!key) return "list";

      try {
        const value = localStorage.getItem(key);

        return value === "grid" ? "grid" : "list";
      } catch (error: unknown) {
        console.warn(
          "File view storage is unavailable; using the session preference.",
          error
        );

        return "list";
      }
    },
    (): FileView => "list"
  );

  const view = session && session.key === key ? session.view : stored;

  const changeView = (value: FileView) => {
    setSession({ key, view: value });
    if (!key) return;

    try {
      localStorage.setItem(key, value);
    } catch (error: unknown) {
      console.warn(
        "File view preference was not saved; retaining it for this session.",
        error
      );
    }
  };

  return [view, changeView] as const;
}
