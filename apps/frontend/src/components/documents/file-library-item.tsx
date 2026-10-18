import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Music2,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { HTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDocumentContentUrl } from "@/lib/services/api/documents/documents.api";
import type { LibraryItem } from "@/lib/services/api/file-library/file-library.api";
import { formatDateTime } from "@/lib/utils/date-time";
import { formatFileSize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { FileLibraryThumbnail } from "./file-library-thumbnail";

interface ItemStatusProps {
  status: string | null;
  deleting: boolean;
}

function ItemStatus({ status, deleting }: ItemStatusProps) {
  if (!status && !deleting) return null;
  const pending = deleting || status === "processing";
  const failed = status === "failed";
  const Icon = pending ? LoaderCircle : failed ? AlertCircle : Check;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs",
        failed && !deleting ? "text-destructive" : "text-ink-muted"
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0",
          pending && "animate-spin motion-reduce:animate-none"
        )}
      />
      {deleting
        ? "Menghapus…"
        : status === "processing"
          ? "Diproses"
          : failed
            ? "Gagal diproses"
            : "Siap"}
    </span>
  );
}

interface ItemMenuProps {
  item: LibraryItem;
  onRename: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}

function ItemMenu({ item, onRename, onEdit, onMove, onDelete }: ItemMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="files-item-menu"
            aria-label={`Tindakan untuk ${item.name}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="files-item-menu-content">
        {item.kind === "file" ? (
          <DropdownMenuItem
            render={
              <a
                href={getDocumentContentUrl(item.id)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLink />
            Buka
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={Boolean(item.deletingOperationId)}
          onClick={item.kind === "folder" ? onRename : onEdit}
        >
          <Pencil />
          {item.kind === "folder" ? "Ganti nama" : "Edit nama & deskripsi"}
        </DropdownMenuItem>
        {item.kind === "file" && item.status === "ready" ? (
          <DropdownMenuItem
            render={<Link to="/" search={{ attachment: item.id }} />}
          >
            <MessageSquareText />
            Tanyakan di chat
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={Boolean(item.deletingOperationId)}
          onClick={onMove}
        >
          <FolderInput />
          Pindahkan ke…
        </DropdownMenuItem>
        <DropdownMenuItem
          destructive
          disabled={Boolean(item.deletingOperationId)}
          onClick={onDelete}
        >
          <Trash2 />
          Hapus permanen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FileLibraryItemProps {
  item: LibraryItem;
  view: "list" | "grid";
  selected: boolean;
  dropTarget: boolean;
  showPath: boolean;
  drag: Pick<
    HTMLAttributes<HTMLLIElement>,
    "onDragStart" | "onDragEnd" | "onDragOver" | "onDragLeave" | "onDrop"
  >;
  onSelect: (selected: boolean) => void;
  onAction: (action: "edit" | "rename" | "move" | "delete") => void;
}

export function FileLibraryItem({
  item,
  view,
  selected,
  dropTarget,
  showPath,
  drag,
  onSelect,
  onAction,
}: FileLibraryItemProps) {
  const Icon =
    item.kind === "folder"
      ? Folder
      : item.fileKind === "audio"
        ? Music2
        : item.fileKind === "image"
          ? FileImage
          : FileText;

  const menu = (
    <ItemMenu
      item={item}
      onEdit={() => onAction("edit")}
      onRename={() => onAction("rename")}
      onMove={() => onAction("move")}
      onDelete={() => onAction("delete")}
    />
  );

  const checkbox = (
    <Checkbox
      className="files-checkbox"
      aria-label={`Pilih ${item.name}`}
      disabled={Boolean(item.deletingOperationId)}
      checked={selected}
      onCheckedChange={onSelect}
    />
  );

  const size =
    item.kind === "folder"
      ? `${item.childCount} item`
      : formatFileSize(item.size!);

  const status = (
    <ItemStatus
      status={item.status}
      deleting={Boolean(item.deletingOperationId)}
    />
  );

  const name =
    item.kind === "folder" ? (
      <Link
        to="/files"
        search={{ folder: item.id }}
        draggable={false}
        className="files-item-name"
        title={item.name}
      >
        {item.name}
      </Link>
    ) : (
      <a
        className="files-item-name"
        draggable={false}
        title={item.name}
        href={getDocumentContentUrl(item.id)}
        target="_blank"
        rel="noreferrer"
      >
        {item.name}
      </a>
    );

  const path = showPath ? (
    <p
      className="files-item-path"
      title={item.path.map((crumb) => crumb.name).join(" / ") || "File saya"}
    >
      File saya
      {item.path.length
        ? ` / ${item.path.map((crumb) => crumb.name).join(" / ")}`
        : ""}
    </p>
  ) : null;

  return (
    <li
      {...drag}
      draggable={!item.deletingOperationId}
      className={cn(
        "files-item",
        showPath && "files-search-result",
        view === "grid" ? "files-tile" : "files-row",
        item.kind === "folder" && "files-folder",
        selected && "files-item-selected",
        dropTarget && "outline-2 outline-brand",
        item.deletingOperationId && "opacity-65"
      )}
    >
      {view === "grid" ? (
        <>
          <div className="files-tile-top">
            {checkbox}
            {menu}
          </div>
          <div className="files-tile-icon">
            <Icon aria-hidden="true" />
          </div>
          <div className="files-tile-name">{name}</div>
          {item.kind === "file" ? (
            <FileLibraryThumbnail
              key={`${item.id}:${item.revision}`}
              item={item}
            />
          ) : null}
          {path}
          <p className="files-tile-metadata">
            {size}
            {item.kind === "file" ? (
              <span className="files-added">
                {" "}
                · {formatDateTime(item.createdAt)}
              </span>
            ) : null}
          </p>
          <div className="files-tile-status">{status}</div>
          {showPath ? (
            <Link
              className="files-open-location"
              to="/files"
              search={{ folder: item.parentId ?? undefined }}
              aria-label={`Buka lokasi ${item.name}`}
            >
              Buka lokasi
            </Link>
          ) : null}
        </>
      ) : (
        <>
          {checkbox}
          <Icon aria-hidden="true" className="files-row-icon" />
          <div className="files-row-name">
            {name}
            {path}
            <p
              className={cn(
                "files-row-mobile-metadata",
                item.status === "failed" && "text-destructive"
              )}
            >
              {size}
              {item.kind === "file" || item.deletingOperationId
                ? ` · ${item.deletingOperationId ? "Menghapus…" : item.status === "processing" ? "Diproses" : item.status === "failed" ? "Gagal diproses" : "Siap"}`
                : ""}
            </p>
          </div>
          <span className="files-row-size">{size}</span>
          <div className="files-row-status">{status}</div>
          <time className="files-row-date" dateTime={item.createdAt}>
            {formatDateTime(item.createdAt)}
          </time>
          {showPath ? (
            <Link
              className="files-open-location"
              to="/files"
              search={{ folder: item.parentId ?? undefined }}
              aria-label={`Buka lokasi ${item.name}`}
            >
              Buka lokasi
            </Link>
          ) : null}
          {menu}
        </>
      )}
    </li>
  );
}
