import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  OCCUPATION_LABELS,
  USER_OCCUPATIONS,
  type UserOccupation,
} from "@/lib/services/api/users/preferences.api";
import { cn } from "@/lib/utils/cn";

interface OccupationOptionsProps {
  value: UserOccupation | null;
  onChange: (value: UserOccupation) => void;
  disabled?: boolean;
  /** Names the group for assistive technology. */
  label: string;
}

/**
 * "Which describes you best" as a grid of choices. The answer picks the
 * example messages Sydia shows; it never limits what the user can do.
 */
export function OccupationOptions({
  value,
  onChange,
  disabled,
  label,
}: OccupationOptionsProps) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as UserOccupation)}
      className="grid gap-2.5 space-y-0 sm:grid-cols-2"
    >
      {USER_OCCUPATIONS.map((occupation) => {
        const selected = value === occupation;

        return (
          <label
            key={occupation}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-[15px] transition-colors duration-200 has-[[data-focused]]:outline-2 has-[[data-focused]]:outline-offset-2 has-[[data-focused]]:outline-brand",
              selected
                ? "border-brand bg-brand/[0.03] text-ink"
                : "border-ink/12 text-ink-soft hover:border-ink/24"
            )}
          >
            <Radio value={occupation} />
            {OCCUPATION_LABELS[occupation]}
          </label>
        );
      })}
    </RadioGroup>
  );
}
