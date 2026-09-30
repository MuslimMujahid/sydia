import { Link } from "@tanstack/react-router";
import { CalendarDays, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type CalendarMode = "calendar" | "tasks";

const MODES = [
  { mode: "calendar", label: "Kalender", icon: CalendarDays },
  { mode: "tasks", label: "Tugas", icon: ListChecks },
] as const;

type CalendarModeSwitchProps = { mode: CalendarMode };

/**
 * Switches the merged page between the calendar of every scheduled item and
 * the task manager. The calendar's view and date survive the round trip.
 */
export function CalendarModeSwitch({ mode }: CalendarModeSwitchProps) {
  return (
    <nav
      aria-label="Mode halaman"
      className="flex h-11 w-fit shrink-0 rounded-md border border-ink/16 p-0.5"
    >
      {MODES.map((entry) => {
        const Icon = entry.icon;
        const active = entry.mode === mode;

        return (
          <Link
            key={entry.mode}
            from="/calendar"
            to="/calendar"
            search={(previous) => ({
              ...previous,
              mode: entry.mode === "tasks" ? "tasks" : undefined,
              id: undefined,
            })}
            aria-label={entry.label}
            title={entry.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-full w-11 items-center justify-center rounded-sm text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50",
              active && "bg-surface-1 text-ink"
            )}
          >
            <Icon aria-hidden="true" className="size-6" />
          </Link>
        );
      })}
    </nav>
  );
}
