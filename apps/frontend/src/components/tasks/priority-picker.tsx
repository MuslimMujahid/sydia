import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TaskPriority } from "@/lib/services/api/tasks/tasks.api";
import { PriorityFlag } from "./priority-flag";
import { PRIORITY_LABELS } from "./task-view";

const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high"];

type PriorityPickerProps = {
  name: string;
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
  onBlur?: () => void;
};

/**
 * Three flag options backed by native radios, so arrow keys move the choice.
 * The label is the radio's accessible name and shows as a tooltip.
 */
export function PriorityPicker({
  name,
  value,
  onChange,
  onBlur,
}: PriorityPickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="block font-sans text-sm font-semibold text-ink">
        Prioritas
      </legend>
      <TooltipProvider delay={300}>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITY_ORDER.map((priority) => (
            <Tooltip key={priority}>
              <TooltipTrigger
                render={
                  <label className="flex h-9 cursor-pointer items-center justify-center rounded-sm border border-ink/16 bg-canvas hover:border-brand/50 has-checked:border-brand has-checked:bg-brand/5 has-focus-visible:ring-4 has-focus-visible:ring-brand/15" />
                }
              >
                <input
                  type="radio"
                  name={name}
                  value={priority}
                  aria-label={PRIORITY_LABELS[priority]}
                  className="sr-only"
                  checked={value === priority}
                  onBlur={onBlur}
                  onChange={() => onChange(priority)}
                />
                <PriorityFlag priority={priority} />
              </TooltipTrigger>
              <TooltipContent>{PRIORITY_LABELS[priority]}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </fieldset>
  );
}
