import { AlertTriangle, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  RecordColumn,
  RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";
import { RecordTypeIcon, RECORD_TYPES } from "./record-column-menu";

interface RecordRowSheetProps {
  row: RecordRow | undefined;
  rowNumber: number;
  title: string;
  columns: RecordColumn[];
  busy: boolean;
  previousAvailable: boolean;
  nextAvailable: boolean;
  value: (column: RecordColumn) => string | boolean | null;
  onChange: (columnId: string, value: string) => void;
  onFinish: () => Promise<void>;
  onDelete: () => void;
  onPrevious: () => Promise<void>;
  onNext: () => Promise<void>;
}

/** A mobile editor retains the entire row context while the grid scrolls horizontally. */
export function RecordRowSheet({
  row,
  rowNumber,
  title,
  columns,
  busy,
  previousAvailable,
  nextAvailable,
  value,
  onChange,
  onFinish,
  onDelete,
  onPrevious,
  onNext,
}: RecordRowSheetProps) {
  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) void onFinish();
      }}
    >
      <DialogContent
        variant="sheet"
        className="[scrollbar-color:var(--color-ink-muted)_var(--color-canvas)] [color-scheme:light] sm:max-w-md"
        showClose={false}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>Baris {rowNumber || ""}</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void onFinish()}
          >
            Selesai
          </Button>
        </div>
        <DialogDescription className="mt-1 text-xs">{title}</DialogDescription>
        {row ? (
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void onFinish();
            }}
          >
            {columns.map((column) => (
              <div key={column.id} className="space-y-2">
                <label
                  htmlFor={`row-editor-${column.id}`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <RecordTypeIcon type={column.type} />
                  {column.name}
                  {column.unit ? (
                    <span className="font-normal text-ink-muted">
                      {column.unit}
                    </span>
                  ) : null}
                </label>
                <Input
                  id={`row-editor-${column.id}`}
                  className="text-base"
                  value={String(value(column) ?? "")}
                  list={
                    column.type === "choice"
                      ? `options-${column.id}`
                      : undefined
                  }
                  placeholder={
                    column.type === "boolean"
                      ? "true / false"
                      : column.type === "date"
                        ? "YYYY-MM-DD"
                        : ""
                  }
                  onChange={(event) => onChange(column.id, event.target.value)}
                  aria-invalid={
                    row.cells[column.id]?.status === "mismatched" || undefined
                  }
                  aria-describedby={
                    row.cells[column.id]?.status === "mismatched"
                      ? `sheet-mismatch-${column.id}`
                      : undefined
                  }
                />
                {row.cells[column.id]?.status === "mismatched" ? (
                  <p
                    id={`sheet-mismatch-${column.id}`}
                    className="flex items-center gap-1 text-xs text-amber-800"
                  >
                    <AlertTriangle className="size-3" />
                    Tidak cocok dengan tipe{" "}
                    {RECORD_TYPES.find(
                      (t) => t.value === column.type
                    )!.label.toLowerCase()}
                  </p>
                ) : null}
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink/8 pt-4">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 />
                Hapus baris
              </Button>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label="Baris sebelumnya"
                  disabled={busy || !previousAvailable}
                  onClick={() => void onPrevious()}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label="Baris berikutnya"
                  disabled={busy || !nextAvailable}
                  onClick={() => void onNext()}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
