import { useRef, useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  GiftPlusDuration,
  validGiftDuration,
  type GiftDurationSelection,
} from "./gift-plus-duration";
import { formatDate } from "./format";
import type { AdminUser, AdminGiftPlusInput, OnGiftPlus } from "./types";

type GiftPlusPopoverProps = {
  user: AdminUser;
  disabled: boolean;
  onGiftPlus: OnGiftPlus;
};

export function GiftPlusPopover({
  user,
  disabled,
  onGiftPlus,
}: GiftPlusPopoverProps) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<GiftDurationSelection>(30);
  const [customDays, setCustomDays] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [request, setRequest] = useState<AdminGiftPlusInput | null>(null);
  const submitting = useRef(false);
  const days = selection === "custom" ? Number(customDays) : selection;
  const valid = validGiftDuration(days);
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
              variant="ghost"
              size="sm"
              className="min-h-8 rounded-[8px] px-2 py-1.5 text-[13px] font-medium text-brand hover:bg-brand/5 hover:text-brand"
              disabled={disabled || pending}
              aria-label={`Beri Sydia Plus kepada ${user.name}`}
            />
          }
        >
          <Gift aria-hidden="true" className="size-3.5" /> Hadiah Plus
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
            <GiftPlusDuration
              selection={selection}
              customDays={customDays}
              disabled={locked}
              onSelectionChange={setSelection}
              onCustomDaysChange={setCustomDays}
            />
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
