import type { TaskPriority } from "@/lib/services/api/tasks/tasks.api";
import { cn } from "@/lib/utils/cn";

const COLOR_CLASS: Record<TaskPriority, string> = {
  low: "text-blue-600",
  medium: "text-amber-500",
  high: "text-red-600",
};

type PriorityFlagProps = {
  priority: TaskPriority;
  className?: string;
};

/** A pennant on a pole, tinted by priority: blue, yellow, red. */
export function PriorityFlag({ priority, className }: PriorityFlagProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5 shrink-0", COLOR_CLASS[priority], className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Pole */}
      <path d="M5.5 21V3.5" />
      {/* Cloth with a soft wave, solid fill so the colour carries */}
      <path
        d="M5.5 4.5c2.2-1.4 4.4-1.4 6.6 0s4.4 1.4 6.4 0v9c-2 1.4-4.2 1.4-6.4 0s-4.4-1.4-6.6 0z"
        fill="currentColor"
        fillOpacity="0.85"
      />
      {/* Highlight along the top edge for depth */}
      <path
        d="M8 5.6c1.4-.5 2.8-.3 4.1.5"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
    </svg>
  );
}
