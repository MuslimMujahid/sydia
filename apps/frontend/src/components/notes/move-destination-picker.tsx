import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Folder, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { WorkspaceItem } from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";

type MoveDestinationPickerProps = {
  folders: WorkspaceItem[];
  currentParentId: string | null;
  parentId: string | null;
  onSelect: (id: string | null) => void;
};

export function MoveDestinationPicker({
  folders,
  currentParentId,
  parentId,
  onSelect,
}: MoveDestinationPickerProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(
    () => new Set(folders.map((folder) => folder.parentId))
  );

  const searching = query.trim().length > 0;
  const matches = folders.filter((folder) =>
    folder.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  function row(folder: WorkspaceItem | null, depth: number) {
    const id = folder ? folder.id : null;
    const selected = parentId === id;
    const children = folders.filter((entry) => entry.parentId === id);
    const open = expanded.has(id);
    const name = folder ? folder.title : "Semua catatan";

    return (
      <li key={id ?? "root"}>
        <div
          className={cn(
            "flex min-h-9 items-center rounded-[10px] pr-3 text-[13px] hover:bg-surface-1",
            selected && "bg-[#f9e9ef] hover:bg-[#f9e9ef]"
          )}
          style={{ paddingLeft: 4 + depth * 16 }}
        >
          {folder && children.length > 0 && !searching ? (
            <button
              type="button"
              aria-label={`${open ? "Tutup" : "Buka"} folder ${name}`}
              aria-expanded={open}
              onClick={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);

                  return next;
                })
              }
              className="flex size-6 shrink-0 items-center justify-center rounded-sm text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-brand"
            >
              {open ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="mx-1.5 size-3 shrink-0 text-ink-muted"
            />
          )}
          <label className="relative flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
            <input
              type="radio"
              name="destination"
              aria-label={folder ? folder.path : name}
              checked={selected}
              onChange={() => onSelect(id)}
              className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
            />
            <Folder
              aria-hidden="true"
              className="size-4 shrink-0 text-ink-muted"
            />
            <span
              className="min-w-0 flex-1 truncate"
              title={folder ? folder.path : name}
            >
              {searching && folder ? folder.path : name}
              {folder && id === currentParentId ? " · lokasi saat ini" : ""}
            </span>
            {selected ? (
              <Check
                aria-hidden="true"
                className="size-4 shrink-0 text-ink-muted"
              />
            ) : null}
          </label>
        </div>
        {folder && open && !searching && children.length > 0 ? (
          <ul>{children.map((child) => row(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <div className="relative mx-6 mt-5">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 size-4 text-ink-muted"
        />
        <Input
          aria-label="Cari folder tujuan"
          placeholder="Cari folder tujuan…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 min-h-10 rounded-[10px] border-[#e8e3e5] pl-[38px] text-[13px]"
        />
      </div>
      <fieldset className="mt-5 flex min-h-0 flex-1 flex-col">
        <legend className="mx-6 text-xs leading-[18px] font-semibold text-ink-muted">
          Pilih tujuan
        </legend>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
          <ul>
            {row(null, 0)}
            {(searching
              ? matches
              : folders.filter((folder) => folder.parentId === null)
            ).map((folder) => row(folder, 0))}
          </ul>
          {searching && matches.length === 0 ? (
            <p role="status" className="px-2 py-3 text-[13px] text-ink-muted">
              Folder tidak ditemukan.
            </p>
          ) : null}
        </div>
      </fieldset>
    </>
  );
}
