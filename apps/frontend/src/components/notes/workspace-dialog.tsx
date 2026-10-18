import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Folder, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  mutateWorkspaceItem,
  type WorkspaceItem,
} from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";
import { MoveDestinationPicker } from "./move-destination-picker";
import type { ItemAction } from "./workspace-tree";

export type WorkspaceDialogTarget = {
  action: Exclude<ItemAction, "trash" | "copy-link">;
  item: WorkspaceItem;
};
type WorkspaceDialogProps = {
  target: WorkspaceDialogTarget;
  items: WorkspaceItem[];
  onClose: () => void;
  onChanged: () => Promise<void>;
};
const TITLES = {
  rename: "Ubah nama",
  move: "Pindahkan ke…",
  restore: "Pulihkan dari Sampah",
  delete: "Hapus permanen?",
};

export function WorkspaceDialog({
  target,
  items,
  onClose,
  onChanged,
}: WorkspaceDialogProps) {
  const item = target.item;
  const [title, setTitle] = useState(item.title);
  const [folderQuery, setFolderQuery] = useState("");
  const [parentId, setParentId] = useState<string | null>(item.parentId);

  const isMove = target.action === "move";
  const sourceFolder = items.find((entry) => entry.id === item.parentId);

  const showFolders = target.action === "move" || target.action === "restore";

  function containsItem(folder: WorkspaceItem) {
    let current: WorkspaceItem | undefined = folder;
    const seen = new Set<string>();

    while (current) {
      if (current.id === item.id || seen.has(current.id)) return true;
      seen.add(current.id);
      const nextId: string | null = current.parentId;
      current = items.find((entry) => entry.id === nextId);
    }

    return false;
  }

  const folders = items
    .filter(
      (entry) =>
        entry.kind === "folder" &&
        !entry.trashedAt &&
        !containsItem(entry) &&
        entry.path.toLocaleLowerCase().includes(folderQuery.toLocaleLowerCase())
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const mutation = useMutation({
    mutationFn: async () => {
      await mutateWorkspaceItem({
        id: target.item.id,
        revision: target.item.revision,
        action:
          target.action === "rename" || target.action === "move"
            ? "update"
            : target.action,
        ...(target.action !== "move" && target.action !== "delete"
          ? { title }
          : {}),
        ...(showFolders ? { parentId } : {}),
      });
      await onChanged();
      onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        variant="sheet"
        className={cn(
          "max-h-[90dvh] overflow-auto sm:max-w-lg",
          isMove &&
            "flex h-[548px] flex-col overflow-hidden rounded-t-[22px] bg-canvas p-0 pb-0 sm:max-w-[480px] sm:rounded-[22px] sm:p-0"
        )}
      >
        <DialogTitle
          className={
            isMove
              ? "mx-6 mt-6 pr-7 font-sans text-[22px] leading-[27px] tracking-normal"
              : undefined
          }
        >
          {isMove
            ? item.kind === "folder"
              ? "Pindahkan folder"
              : "Pindahkan catatan"
            : TITLES[target.action]}
        </DialogTitle>
        {isMove ? (
          <DialogDescription className="mx-6 mt-3 min-w-0 truncate text-xs leading-[18px]">
            <span>{sourceFolder ? sourceFolder.path : "Semua catatan"} / </span>
            <span className="font-medium text-ink">{item.title}</span>
          </DialogDescription>
        ) : null}
        {target.action === "delete" ? (
          <DialogDescription className="mt-4">
            “{item.title}” beserta seluruh isinya akan dihapus permanen.
            Tindakan ini tidak dapat dibatalkan.
          </DialogDescription>
        ) : null}
        {target.action === "rename" || target.action === "restore" ? (
          <label className="mt-5 block text-sm">
            Nama
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !mutation.isPending &&
                  title.trim()
                )
                  mutation.mutate();
              }}
            />
          </label>
        ) : null}
        {isMove ? (
          <MoveDestinationPicker
            folders={items
              .filter(
                (entry) =>
                  entry.kind === "folder" &&
                  !entry.trashedAt &&
                  !containsItem(entry)
              )
              .sort((a, b) => a.path.localeCompare(b.path))}
            currentParentId={item.parentId}
            parentId={parentId}
            onSelect={setParentId}
          />
        ) : showFolders ? (
          <>
            <p className="mt-4 text-xs text-ink-muted">
              Lokasi semula: {item.path}
            </p>
            <Input
              aria-label="Cari folder tujuan"
              placeholder="Cari folder…"
              value={folderQuery}
              onChange={(event) => setFolderQuery(event.target.value)}
              className="mt-4"
            />
            <fieldset className="mt-3 max-h-64 space-y-1 overflow-auto">
              <legend className="sr-only">Folder tujuan</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 hover:bg-surface-1">
                <input
                  type="radio"
                  name="destination"
                  checked={parentId === null}
                  onChange={() => setParentId(null)}
                />
                <Folder className="size-4 shrink-0" />
                <span>Semua catatan (akar)</span>
              </label>
              {folders.map((folder) => (
                <label
                  key={folder.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 hover:bg-surface-1"
                >
                  <input
                    type="radio"
                    name="destination"
                    checked={parentId === folder.id}
                    onChange={() => setParentId(folder.id)}
                  />
                  <Folder className="size-4 shrink-0" />
                  <span className="min-w-0 truncate text-sm">
                    {folder.path}
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        ) : null}
        {mutation.error ? (
          <p
            role="alert"
            className={cn(
              "mt-4 text-sm text-destructive",
              isMove && "mx-6 mt-2"
            )}
          >
            {mutation.error.message}
          </p>
        ) : null}
        <div
          className={cn(
            "mt-6 flex justify-end gap-3",
            isMove &&
              "mx-6 mt-0 shrink-0 border-t border-[#e8e3e5] pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]"
          )}
        >
          <Button
            variant={isMove ? "dark-outline" : "ghost"}
            className={
              isMove
                ? "min-h-10 rounded-[10px] border-[#e8e3e5] px-[18px] py-2 text-sm"
                : undefined
            }
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            variant={target.action === "delete" ? "destructive" : "primary"}
            className={
              isMove
                ? "min-h-10 rounded-2xl px-3.5 py-2 text-sm font-semibold shadow-none"
                : undefined
            }
            disabled={
              mutation.isPending ||
              ((target.action === "rename" || target.action === "restore") &&
                !title.trim())
            }
            onClick={() => mutation.mutate()}
          >
            {isMove ? (
              <FolderInput aria-hidden="true" className="size-[18px]" />
            ) : null}
            {mutation.isPending
              ? "Menyimpan…"
              : target.action === "delete"
                ? "Hapus permanen"
                : target.action === "restore"
                  ? "Pulihkan"
                  : target.action === "move"
                    ? "Pindahkan"
                    : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
