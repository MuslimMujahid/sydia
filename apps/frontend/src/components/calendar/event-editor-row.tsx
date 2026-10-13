import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type EventEditorRowProps = {
  icon: LucideIcon;
  label: string;
  summary: ReactNode;
  detail?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function EventEditorRow({
  icon: Icon,
  label,
  summary,
  detail,
  open,
  onToggle,
  children,
}: EventEditorRowProps) {
  const id = useId();

  return (
    <div>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className={cn(
          "flex min-h-11 w-full items-start gap-4 rounded-md px-2 py-2.5 text-left text-sm outline-none hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-brand/50",
          open && "bg-surface-1/60"
        )}
      >
        <Icon
          className="mt-0.5 size-4.5 shrink-0 text-ink-muted"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ink">{summary}</span>
          {detail ? (
            <span className="mt-0.5 block text-xs text-ink-muted">
              {detail}
            </span>
          ) : null}
        </span>
      </button>
      <div id={id} hidden={!open} className="space-y-3 pt-2 pr-2 pb-3 pl-10.5">
        {open ? children : null}
      </div>
    </div>
  );
}
