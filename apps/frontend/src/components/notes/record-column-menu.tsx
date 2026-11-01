import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckSquare,
  CircleCheck,
  Clock,
  Hash,
  Pencil,
  Plus,
  Trash2,
  Type,
  Settings2,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type { RecordColumn } from "@/lib/services/api/record-notes/record-notes.api";

export const RECORD_TYPES = [
  { value: "text", label: "Teks", icon: Type },
  { value: "number", label: "Angka", icon: Hash },
  { value: "date", label: "Tanggal", icon: CalendarDays },
  { value: "datetime", label: "Tanggal & waktu", icon: Clock },
  { value: "boolean", label: "Kotak centang", icon: CheckSquare },
  { value: "choice", label: "Pilihan tunggal", icon: CircleCheck },
] as const;

export function RecordTypeIcon({ type }: { type: RecordColumn["type"] }) {
  const Icon = RECORD_TYPES.find((t) => t.value === type)!.icon;

  return <Icon className="size-3.5 shrink-0 text-ink-muted" />;
}

interface RecordColumnMenuProps {
  column: RecordColumn;
  index: number;
  total: number;
  disabled: boolean;
  onHighlightChange: (state: "menu" | "confirm" | null) => void;
  onRename: () => void;
  onType: (type: RecordColumn["type"]) => void;
  onRemove: () => void;
  onInsert: (side: "left" | "right") => void;
  onMove: (direction: -1 | 1) => void;
  onSort: (direction: "asc" | "desc") => void;
  onConfigure: (input: { unit?: string; options?: string[] }) => void;
}

export function RecordColumnMenu({
  column,
  index,
  total,
  disabled,
  onRename,
  onHighlightChange,
  onType,
  onRemove,
  onInsert,
  onMove,
  onSort,
  onConfigure,
}: RecordColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [value, setValue] = useState("");

  function changeOpen(next: boolean) {
    setOpen(next);

    if (next) {
      setConfirm(false);
      setConfigure(false);
    }

    onHighlightChange(next ? "menu" : null);
  }

  return (
    <DropdownMenu open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Menu kolom ${column.name}`}
        className="flex h-[35px] w-full items-center gap-1.5 px-2.5 text-left text-xs font-semibold outline-none hover:bg-ink/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        onContextMenu={(event) => {
          event.preventDefault();
          changeOpen(true);
        }}
        onDoubleClick={() => {
          changeOpen(false);
          onRename();
        }}
      >
        <RecordTypeIcon type={column.type} />
        <span className="truncate">{column.name}</span>
        {column.unit ? (
          <span className="ml-auto text-xs font-normal text-ink-muted">
            {column.unit}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={confirm ? "end" : "start"}
        finalFocus={!configure}
        className={cn(
          "[--destructive:#c0362c]",
          confirm
            ? "w-[260px] rounded-[10px] border-[#e8e3e5] p-4 shadow-[0_8px_24px_rgba(23,20,25,0.12)]"
            : "w-60"
        )}
      >
        {confirm ? (
          <div>
            <div className="flex items-start gap-3">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              <div className="min-w-0">
                <p className="text-sm leading-[18px] font-semibold">
                  Hapus kolom “{column.name}”?
                </p>
                <p className="mt-1.5 text-xs leading-[17px] text-ink-muted">
                  Semua isi kolom ini akan dihapus. Anda dapat mengurungkannya
                  setelah dihapus.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                autoFocus
                size="sm"
                variant="dark-outline"
                className="h-8 min-h-8 rounded-[10px] border-[#e8e3e5] px-3.5 py-0 text-[13px] focus:outline-2 focus:outline-solid focus:outline-offset-2 focus:outline-brand max-sm:min-h-11"
                onClick={() => changeOpen(false)}
              >
                Batal
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 min-h-8 rounded-[10px] px-3.5 py-0 text-[13px] max-sm:min-h-11"
                onClick={() => {
                  changeOpen(false);
                  onRemove();
                }}
              >
                Hapus kolom
              </Button>
            </div>
          </div>
        ) : configure ? (
          <form
            className="space-y-3 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              onConfigure(
                column.type === "number"
                  ? { unit: value || undefined }
                  : {
                      options: value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }
              );
              changeOpen(false);
            }}
          >
            <label
              htmlFor={`config-${column.id}`}
              className="text-xs font-semibold"
            >
              {column.type === "number"
                ? "Satuan / mata uang"
                : "Pilihan (pisahkan dengan koma)"}
            </label>
            <Input
              id={`config-${column.id}`}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button size="sm" type="submit">
              Simpan
            </Button>
          </form>
        ) : (
          <>
            <DropdownMenuItem onClick={() => onSort("asc")}>
              <ArrowUp />
              Urutkan naik
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSort("desc")}>
              <ArrowDown />
              Urutkan turun
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Kolom</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  changeOpen(false);
                  onRename();
                }}
              >
                <Pencil />
                Ganti nama
              </DropdownMenuItem>
              <DropdownMenuSubmenu>
                <DropdownMenuSubmenuTrigger>
                  <RecordTypeIcon type={column.type} />
                  Ubah tipe
                </DropdownMenuSubmenuTrigger>
                <DropdownMenuContent side="right" className="w-52">
                  {RECORD_TYPES.map((t) => (
                    <DropdownMenuItem
                      key={t.value}
                      onClick={() => {
                        changeOpen(false);
                        onType(t.value);
                      }}
                    >
                      <t.icon />
                      {t.label}
                      {column.type === t.value ? (
                        <CircleCheck className="ml-auto text-brand" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenuSubmenu>
              {column.type === "number" || column.type === "choice" ? (
                <DropdownMenuItem
                  closeOnClick={false}
                  onClick={() => {
                    setValue(
                      column.type === "number"
                        ? (column.unit ?? "")
                        : (column.options?.join(", ") ?? "")
                    );
                    setConfigure(true);
                  }}
                >
                  <Settings2 />
                  {column.type === "number"
                    ? "Satuan / mata uang"
                    : "Atur pilihan"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onInsert("left")}>
                <Plus />
                Sisipkan kolom di kiri
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsert("right")}>
                <Plus />
                Sisipkan kolom di kanan
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === 0}
                onClick={() => onMove(-1)}
              >
                <ArrowLeft />
                Geser ke kiri
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === total - 1}
                onClick={() => onMove(1)}
              >
                <ArrowRight />
                Geser ke kanan
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              closeOnClick={false}
              onClick={() => {
                setConfirm(true);
                onHighlightChange("confirm");
              }}
            >
              <Trash2 />
              Hapus kolom…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
