import { Clock3, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";

const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
const MINUTE_STEP = 5;
const STEP_MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
  pad(index * MINUTE_STEP)
);

/** Where the columns start when no time is set yet. */
const DEFAULT_HOUR = "09";
const DEFAULT_MINUTE = "00";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The step minutes, plus an off-step saved minute (e.g. 07) so it shows. */
function minuteOptions(selected: string): string[] {
  if (!selected || STEP_MINUTES.includes(selected)) return STEP_MINUTES;

  return [...STEP_MINUTES, selected].sort();
}

/**
 * Up/Down (and Home/End) move focus within one column. Each column is a
 * single tab stop, so Tab goes hour → minute → actions.
 */
function handleColumnKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")
  );

  const index = buttons.findIndex((button) => button === event.target);

  if (index === -1) return;

  const next =
    event.key === "ArrowDown"
      ? index + 1
      : event.key === "ArrowUp"
        ? index - 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : null;

  if (next === null) return;

  event.preventDefault();
  buttons[Math.min(Math.max(next, 0), buttons.length - 1)]?.focus();
}

type TimeColumnProps = {
  label: string;
  options: string[];
  /** The value shown as chosen. */
  selected: string;
  /** The value owning the column's tab stop (the chosen or default value). */
  active: string;
  activeRef?: RefObject<HTMLButtonElement | null>;
  onSelect: (value: string) => void;
};

function TimeColumn({
  label,
  options,
  selected,
  active,
  activeRef,
  onSelect,
}: TimeColumnProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
      onKeyDown={handleColumnKeyDown}
    >
      {options.map((option) => {
        const isSelected = option === selected;
        const isActive = option === active;

        return (
          <button
            key={option}
            ref={isActive ? activeRef : undefined}
            type="button"
            data-active={isActive || undefined}
            tabIndex={isActive ? 0 : -1}
            aria-pressed={isSelected}
            className={cn(
              "h-9 shrink-0 rounded-sm font-mono text-sm text-ink outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50",
              isSelected && "bg-ink text-canvas hover:bg-ink"
            )}
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

type TimePickerProps = {
  id: string;
  /** Accessible name, e.g. "Jam tenggat" or "Jam mulai". */
  label: string;
  /** "HH:mm", or empty for no time. */
  value: string;
  /** Whether the time can be removed ("Hapus jam"). */
  clearable?: boolean;
  /** Shown when there is no time. */
  emptyLabel?: string;
  /** Hint in the popover while there is no time, e.g. what "no time" means. */
  emptyHint?: string;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
};

/**
 * 24-hour time chooser: an hour column and a 5-minute column in a popover.
 * When `clearable`, "Hapus jam" goes back to no time.
 */
export function TimePicker({
  id,
  label,
  value,
  clearable = false,
  emptyLabel = "Pilih jam",
  emptyHint,
  disabled = false,
  describedBy,
  invalid = false,
  onChange,
  onBlur,
}: TimePickerProps) {
  const hourRef = useRef<HTMLButtonElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hour = "", minute = ""] = value ? value.split(":") : [];
  const activeHour = hour || DEFAULT_HOUR;
  const activeMinute = minute || DEFAULT_MINUTE;

  // Bring the chosen (or default) hour and minute into view when opening.
  useEffect(() => {
    if (!open) return;

    const frame = requestAnimationFrame(() => {
      columnsRef.current
        ?.querySelectorAll<HTMLButtonElement>("[data-active]")
        .forEach((button) => button.scrollIntoView({ block: "center" }));
    });

    return () => cancelAnimationFrame(frame);
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) onBlur?.();
  }

  function close() {
    setOpen(false);
    onBlur?.();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={`${label}, ${value || emptyLabel.toLowerCase()}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border border-ink/16 bg-canvas px-3 text-left font-sans text-[15px] text-ink outline-none hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:pointer-events-none disabled:bg-ink/4 disabled:opacity-40 aria-invalid:border-destructive data-[popup-open]:border-brand"
      >
        <Clock3 className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span
          className={cn("truncate", value ? "font-mono" : "text-ink-muted")}
        >
          {value || emptyLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3" initialFocus={hourRef}>
        <div
          ref={columnsRef}
          className="grid grid-cols-2 divide-x divide-ink/8 rounded-sm border border-ink/8"
        >
          <TimeColumn
            label="Jam"
            options={HOURS}
            selected={hour}
            active={activeHour}
            activeRef={hourRef}
            onSelect={(nextHour) => onChange(`${nextHour}:${activeMinute}`)}
          />
          <TimeColumn
            label="Menit"
            options={minuteOptions(minute)}
            selected={minute}
            active={activeMinute}
            onSelect={(nextMinute) => {
              onChange(`${activeHour}:${nextMinute}`);
              close();
            }}
          />
        </div>
        {clearable ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">
              {value ? "" : (emptyHint ?? "")}
            </p>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-ink-muted"
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                <X />
                Hapus jam
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
