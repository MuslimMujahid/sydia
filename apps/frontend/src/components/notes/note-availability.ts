import type { WorkspaceItem } from "@/lib/services/api/notes/notes.api";

export function isInWorkspaceSubtree(
  ref: string | null,
  rootId: string,
  items: WorkspaceItem[]
) {
  if (!ref?.startsWith("custom:")) return false;
  let id: string | null = ref.slice(7);
  const seen = new Set<string>();

  while (id && !seen.has(id)) {
    if (id === rootId) return true;
    seen.add(id);
    id = items.find((item) => item.id === id)?.parentId ?? null;
  }

  return false;
}
