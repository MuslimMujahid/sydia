import type {
  NoteEntry,
  WorkspaceItem,
} from "@/lib/services/api/notes/notes.api";

export function validNoteRef(ref: string): boolean {
  if (/^custom:[a-zA-Z0-9_-]+$/.test(ref)) return true;
  if (!/^daily:\d{4}-\d{2}-\d{2}$/.test(ref)) return false;

  const day = ref.slice(6);
  const date = new Date(`${day}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
  );
}

export function folderChildren(
  items: WorkspaceItem[],
  parentId: string | null
): WorkspaceItem[] {
  return items
    .filter((item) => item.parentId === parentId && !item.trashedAt)
    .sort((first, second) =>
      first.kind === second.kind
        ? first.title.localeCompare(second.title)
        : first.kind === "folder"
          ? -1
          : 1
    );
}

export function trashRoots(items: WorkspaceItem[]): WorkspaceItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.filter((item) => {
    if (!item.trashedAt) return false;
    if (!item.parentId) return true;
    const parent = byId.get(item.parentId);

    return !parent?.trashedAt || parent.trashBatchId !== item.trashBatchId;
  });
}

export function moveTargets(
  items: WorkspaceItem[],
  item: WorkspaceItem,
  includeCurrent = false
): WorkspaceItem[] {
  const prohibited = new Set([item.id]);
  const children = new Map<string | null, WorkspaceItem[]>();

  for (const other of items) {
    const siblings = children.get(other.parentId) ?? [];
    siblings.push(other);
    children.set(other.parentId, siblings);
  }

  const pending = [...(children.get(item.id) ?? [])];
  for (const child of pending) {
    if (prohibited.has(child.id)) continue;
    prohibited.add(child.id);
    pending.push(...(children.get(child.id) ?? []));
  }

  return items
    .filter(
      (candidate) =>
        candidate.kind === "folder" &&
        !candidate.trashedAt &&
        !prohibited.has(candidate.id) &&
        (includeCurrent || candidate.id !== item.parentId)
    )
    .sort((first, second) => first.path.localeCompare(second.path));
}

/** Daily list IDs belong to the saved notes, while references carry day keys. */
export function dailyNoteHistory(notes: NoteEntry[], today: string) {
  return notes
    .flatMap((entry) => {
      if (entry.kind !== "daily" || !validNoteRef(entry.ref)) return [];
      const day = entry.ref.slice(6);
      return day === today ? [] : [{ ...entry, day }];
    })
    .sort((first, second) => second.day.localeCompare(first.day));
}

export function noteWebLink(base: string, ref: string): string {
  const url = new URL("/notes", base);
  const daily = ref.startsWith("daily:");
  url.searchParams.set(daily ? "date" : "note", ref.slice(daily ? 6 : 7));
  return url.toString();
}
