import { useState, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  MoreHorizontal,
  Pencil,
  FolderInput,
  Link2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceItem } from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";
import { InlineFolderForm, type FolderCreation } from "./inline-folder-form";

export type ItemAction =
  "rename" | "move" | "trash" | "restore" | "delete" | "copy-link";
type ItemMenuProps = {
  item: WorkspaceItem;
  className?: string;
  onAction: (action: ItemAction, item: WorkspaceItem) => void;
};

export function ItemMenu({ item, onAction, className }: ItemMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("min-h-11 min-w-11 sm:min-h-8 sm:min-w-8", className)}
            aria-label={`Tindakan ${item.title}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAction("rename", item)}>
          <Pencil />
          Ubah nama
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("move", item)}>
          <FolderInput />
          Pindahkan ke…
        </DropdownMenuItem>
        {item.kind === "note" ? (
          <DropdownMenuItem onClick={() => onAction("copy-link", item)}>
            <Link2 />
            Salin tautan
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem destructive onClick={() => onAction("trash", item)}>
          <Trash2 />
          Pindahkan ke Sampah
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type WorkspaceTreeProps = {
  items: WorkspaceItem[];
  folderCreation: FolderCreation;
  selectedRef: string | null;
  onNote: (ref: string) => void;
  onAction: ItemMenuProps["onAction"];
  onMove: (item: WorkspaceItem, parentId: string | null) => void;
};

export function WorkspaceTree({
  items,
  folderCreation,
  selectedRef,
  onNote,
  onAction,
  onMove,
}: WorkspaceTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [revealedDraft, setRevealedDraft] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const live = items.filter((item) => !item.trashedAt);

  // Reveal the destination before committing the input, so autofocus also
  // works when one of its ancestors was collapsed.
  if (
    folderCreation.draft &&
    folderCreation.draft.requestKey !== revealedDraft
  ) {
    setRevealedDraft(folderCreation.draft.requestKey);
    const ancestors = new Set<string>();
    let parent: string | null = folderCreation.draft.parentId;

    while (parent !== null && !ancestors.has(parent)) {
      ancestors.add(parent);
      const item = items.find((candidate) => candidate.id === parent);

      if (!item) break;
      parent = item.parentId;
    }

    setCollapsed(
      (previous) => new Set([...previous].filter((id) => !ancestors.has(id)))
    );
  }

  function drop(event: DragEvent, parentId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setOver(null);
    const id = event.dataTransfer.getData("application/x-sydia-note");
    const item = live.find((candidate) => candidate.id === id);
    if (item) onMove(item, parentId);
  }

  function branch(parentId: string | null, parentLabel: string) {
    const children = live
      .filter((item) => item.parentId === parentId)
      .sort(
        (a, b) =>
          Number(b.kind === "folder") - Number(a.kind === "folder") ||
          a.title.localeCompare(b.title)
      );

    return (
      <ul
        className={cn(
          "space-y-1",
          parentId !== null && "mt-1 ml-4 border-l border-ink/6 pl-1"
        )}
      >
        {folderCreation.draft?.parentId === parentId ? (
          <li>
            <InlineFolderForm
              draft={folderCreation.draft}
              creation={folderCreation}
              parentLabel={parentLabel}
            />
          </li>
        ) : null}
        {children.map((item) => {
          const folder = item.kind === "folder";
          const expanded = !collapsed.has(item.id);
          const selected = !folder && selectedRef === `custom:${item.id}`;

          return (
            <li key={item.id}>
              <div
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/x-sydia-note",
                    item.id
                  );
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={
                  folder
                    ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOver(item.id);
                      }
                    : undefined
                }
                onDragLeave={() => setOver(null)}
                onDrop={folder ? (event) => drop(event, item.id) : undefined}
                className={cn(
                  "group flex min-h-10 min-w-0 items-center rounded-sm hover:bg-surface-1",
                  selected && "bg-brand/10",
                  over === item.id && "outline-2 outline-brand"
                )}
              >
                <button
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-brand sm:min-h-10"
                  aria-current={selected ? "page" : undefined}
                  aria-expanded={folder ? expanded : undefined}
                  onClick={() => {
                    if (folder) {
                      setCollapsed((previous) => {
                        const next = new Set(previous);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);

                        return next;
                      });
                    } else onNote(`custom:${item.id}`);
                  }}
                >
                  <span className="grid w-11 shrink-0 place-items-center sm:w-6">
                    {folder ? (
                      expanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )
                    ) : null}
                  </span>
                  {folder ? (
                    <Folder className="size-4 shrink-0 text-ink-muted" />
                  ) : (
                    <FileText
                      className={cn(
                        "size-4 shrink-0 text-ink-muted",
                        selected && "text-brand"
                      )}
                    />
                  )}
                  <span className={cn("truncate", selected && "font-semibold")}>
                    {item.title}
                  </span>
                </button>
                <ItemMenu
                  item={item}
                  onAction={onAction}
                  className="sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                />
              </div>
              {folder && expanded ? branch(item.id, item.path) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      className="min-h-20"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => drop(event, null)}
    >
      {branch(null, "Semua catatan")}
      {live.length === 0 && !folderCreation.draft ? (
        <p className="px-2 py-3 text-sm text-ink-muted">
          Belum ada catatan khusus.
        </p>
      ) : null}
    </div>
  );
}
