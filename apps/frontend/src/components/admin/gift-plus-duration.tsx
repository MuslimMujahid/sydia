import { useId } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

const DURATIONS = [7, 30, 90, 180] as const;
export type GiftDurationSelection = number | "custom";

export function validGiftDuration(days: number) {
  return Number.isInteger(days) && days >= 1 && days <= 3650;
}

type GiftPlusDurationProps = {
  selection: GiftDurationSelection;
  customDays: string;
  disabled: boolean;
  onSelectionChange: (selection: GiftDurationSelection) => void;
  onCustomDaysChange: (days: string) => void;
};

export function GiftPlusDuration({
  selection,
  customDays,
  disabled,
  onSelectionChange,
  onCustomDaysChange,
}: GiftPlusDurationProps) {
  const id = useId();
  const invalidCustom =
    customDays !== "" && !validGiftDuration(Number(customDays));

  return (
    <>
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">Batas waktu</legend>
        <div className="grid grid-cols-3 gap-2">
          {[...DURATIONS, "custom" as const].map((duration) => (
            <Button
              key={duration}
              type="button"
              variant="dark-outline"
              size="sm"
              aria-pressed={selection === duration}
              onClick={() => onSelectionChange(duration)}
              className={cn(
                "h-10 px-2",
                selection === duration && "border-brand bg-brand/8 text-ink"
              )}
            >
              {selection === duration && (
                <Check className="size-3.5" aria-hidden="true" />
              )}
              {duration === "custom" ? "Kustom" : `${duration} hari`}
            </Button>
          ))}
        </div>
        {selection === "custom" && (
          <div className="mt-3 space-y-1.5">
            <label htmlFor={`${id}-days`} className="text-sm font-medium">
              Jumlah hari
            </label>
            <Input
              id={`${id}-days`}
              type="number"
              min={1}
              max={3650}
              step={1}
              required
              value={customDays}
              onChange={(event) => onCustomDaysChange(event.target.value)}
              aria-invalid={invalidCustom}
              aria-describedby={`${id}-hint`}
            />
            <p id={`${id}-hint`} className="text-xs text-ink-muted">
              Masukkan 1–3.650 hari.
            </p>
          </div>
        )}
      </fieldset>
      <p className="text-xs leading-relaxed text-ink-muted">
        Durasi ditambahkan setelah masa aktif yang tersisa. Pengguna tidak
        dikenai biaya.
      </p>
    </>
  );
}
