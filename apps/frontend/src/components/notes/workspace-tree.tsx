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

export type ItemAction =
  "rename" | "move" | "trash" | "restore" | "delete" | "copy-link";
type ItemMenuProps = {
  item: WorkspaceItem;
  onAction: (action: ItemAction, item: WorkspaceItem) => void;
};

export function ItemMenu({ item, onAction }: ItemMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
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
  selectedRef: string | null;
  selectedFolder: string | null;
  onNote: (ref: string) => void;
  onFolder: (id: string | null) => void;
  onAction: ItemMenuProps["onAction"];
  onMove: (item: WorkspaceItem, parentId: string | null) => void;
};

export function WorkspaceTree({
  items,
  selectedRef,
  selectedFolder,
  onNote,
  onFolder,
  onAction,
  onMove,
}: WorkspaceTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const live = items.filter((item) => !item.trashedAt);

  function drop(event: DragEvent, parentId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setOver(null);
    const id = event.dataTransfer.getData("application/x-sydia-note");
    const item = live.find((candidate) => candidate.id === id);
    if (item) onMove(item, parentId);
  }

  function branch(parentId: string | null) {
    const children = live
      .filter((item) => item.parentId === parentId)
      .sort(
        (a, b) =>
          Number(b.kind === "folder") - Number(a.kind === "folder") ||
          a.title.localeCompare(b.title)
      );

    return (
      <ul
        className={cn(parentId !== null && "ml-4 border-l border-ink/6 pl-1")}
      >
        {children.map((item) => {
          const folder = item.kind === "folder";
          const expanded = !collapsed.has(item.id);
          const selected = folder
            ? selectedFolder === item.id
            : selectedRef === `custom:${item.id}`;

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
                {folder ? (
                  <button
                    className="grid min-h-11 w-11 shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-brand sm:min-h-9 sm:w-6"
                    aria-label={`${expanded ? "Ciutkan" : "Bentangkan"} ${item.title}`}
                    aria-expanded={expanded}
                    onClick={() =>
                      setCollapsed((previous) => {
                        const next = new Set(previous);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);

                        return next;
                      })
                    }
                  >
                    {expanded ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="w-11 shrink-0 sm:w-6" />
                )}
                <button
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-brand sm:min-h-9"
                  aria-current={selected ? "page" : undefined}
                  onClick={() =>
                    folder ? onFolder(item.id) : onNote(`custom:${item.id}`)
                  }
                >
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
                <ItemMenu item={item} onAction={onAction} />
              </div>
              {folder && expanded ? branch(item.id) : null}
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
      <button
        className="mb-2 min-h-11 w-full rounded-sm px-2 text-left text-xs text-ink-muted outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand sm:min-h-8"
        onClick={() => onFolder(null)}
      >
        Semua folder
      </button>
      {branch(null)}
      {live.length === 0 ? (
        <p className="px-2 py-3 text-sm text-ink-muted">
          Belum ada catatan khusus.
        </p>
      ) : null}
    </div>
  );
}
