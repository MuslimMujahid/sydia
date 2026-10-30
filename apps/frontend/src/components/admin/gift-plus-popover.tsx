import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "./format";
import type { AdminUser, AdminGiftPlusInput, OnGiftPlus } from "./types";

type GiftPlusPopoverProps = {
  user: AdminUser;
  disabled: boolean;
  onGiftPlus: OnGiftPlus;
};

const DURATIONS = [7, 30, 90, 180] as const;

export function GiftPlusPopover({
  user,
  disabled,
  onGiftPlus,
}: GiftPlusPopoverProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<number | "custom">(30);
  const [customDays, setCustomDays] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [request, setRequest] = useState<AdminGiftPlusInput | null>(null);
  const submitting = useRef(false);
  const days = selection === "custom" ? Number(customDays) : selection;
  const valid = Number.isInteger(days) && days >= 1 && days <= 3650;
  const invalidCustom = selection === "custom" && customDays !== "" && !valid;
  const locked = pending || request !== null;

  async function applyGift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);

    // Retain the same request after a network failure, including closing/reopening.
    try {
      const currentRequest = request ?? {
        durationDays: days,
        requestId: crypto.randomUUID(),
      };

      setRequest(currentRequest);
      const result = await onGiftPlus(user, currentRequest);
      setSuccess(
        `Sydia Plus diberikan kepada ${user.name} hingga ${formatDate(result.paidUntil)}.`
      );
      setRequest(null);
      setOpen(false);
    } catch (caught) {
      console.error("Sydia Plus gift could not be confirmed", caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Hadiah belum dapat dikonfirmasi. Coba lagi."
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="dark-outline"
              size="sm"
              disabled={disabled || pending}
              aria-label={`Beri Sydia Plus kepada ${user.name}`}
            />
          }
        >
          Beri Plus <ChevronDown aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-4">
          <PopoverTitle className="text-base">Hadiah Sydia Plus</PopoverTitle>
          <p className="mt-1 truncate text-sm text-ink-muted">{user.name}</p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
          <form
            onSubmit={(event) => void applyGift(event)}
            className="mt-5 space-y-4"
            aria-busy={pending}
          >
            <fieldset disabled={locked}>
              <legend className="mb-2 text-sm font-medium">Batas waktu</legend>
              <div className="grid grid-cols-3 gap-2">
                {[...DURATIONS, "custom" as const].map((duration) => (
                  <Button
                    key={duration}
                    type="button"
                    variant="dark-outline"
                    size="sm"
                    aria-pressed={selection === duration}
                    onClick={() => setSelection(duration)}
                    className={cn(
                      "h-10 px-2",
                      selection === duration &&
                        "border-brand bg-brand/8 text-ink"
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
                    onChange={(event) => setCustomDays(event.target.value)}
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
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="dark"
              className="w-full"
              disabled={!valid || pending}
            >
              {pending ? "Menerapkan…" : error ? "Coba lagi" : "Terapkan"}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      {success && (
        <span role="status" className="sr-only">
          {success}
        </span>
      )}
    </>
  );
}
