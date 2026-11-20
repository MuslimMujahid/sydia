import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, X } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import {
  billingGiftsQueryOptions,
  useAcknowledgeBillingGifts,
} from "@/lib/services/api/billing/billing.api";
import type { UserProfile } from "@/lib/services/api/users/users.queries";
import "./gift-celebration.css";

// Horizontal spread as a percentage of the scene, apex in pixels, spin, delay.
const CONFETTI = [
  [-41, -22, -258, 40],
  [38, -38, 226, 60],
  [45, -6, 258, 0],
  [-34, -43, -201, 100],
  [29, -50, 290, 25],
  [-45, -4, -246, 55],
  [-27, -48, -196, 0],
  [45, 8, 274, 110],
  [40, -20, 310, 130],
  [-22, -32, -150, 30],
  [-38, 10, -227, 125],
  [30, -19, 197, 65],
  [-31, -11, -270, 145],
  [20, -47, 166, 125],
  [33, 12, 280, 180],
  [-43, 15, -210, 175],
  [-15, -50, -215, 135],
  [42, -28, 204, 180],
  [36, -5, 251, 210],
  [-42, -31, -180, 115],
  [13, -34, 166, 205],
  [-27, 13, -216, 225],
  [-36, -20, -240, 245],
  [26, 10, 278, 240],
] as const;

function GiftReveal() {
  return (
    <div className="gift-reveal" aria-hidden="true">
      <span className="gift-glow" />
      {CONFETTI.map(([spread, rise, spin, delay]) => (
        <span
          key={`${spread}:${rise}`}
          className="gift-confetti"
          style={
            {
              "--gift-x": `${spread}cqw`,
              "--gift-y": `${rise}px`,
              "--gift-spin": `${spin}deg`,
              "--gift-delay": `${delay}ms`,
            } as CSSProperties
          }
        />
      ))}
      <div className="gift-present">
        <span className="gift-token">
          <SydiaLogo className="h-5" />
        </span>
        <span className="gift-box" />
        <span className="gift-lid">
          <span className="gift-bow" />
        </span>
      </div>
    </div>
  );
}

type GiftCelebrationProps = Pick<UserProfile, "id" | "locale" | "timezone">;

export function GiftCelebration({
  id,
  locale,
  timezone,
}: GiftCelebrationProps) {
  const { data: gifts } = useQuery(billingGiftsQueryOptions(id));
  const acknowledge = useAcknowledgeBillingGifts(id);
  const latest = gifts?.[0];

  if (!gifts || !latest) return null;

  const isEnglish = locale === "en";
  const days = gifts.reduce((total, gift) => total + gift.durationDays, 0);
  const lang = isEnglish ? "en-US" : "id-ID";
  const duration = new Intl.NumberFormat(lang).format(days);
  const dayUnit = days === 1 ? "day" : "days";
  const date = new Intl.DateTimeFormat(lang, {
    dateStyle: "long",
    timeZone: timezone,
  }).format(new Date(latest.paidUntil));

  return (
    <aside
      key={latest.id}
      aria-label={isEnglish ? "Sydia Plus gift" : "Hadiah Sydia Plus"}
      className="fixed inset-x-4 top-16 z-40 mx-auto max-w-sm rounded-2xl border border-ink/8 bg-canvas p-6 shadow-card sm:inset-x-auto sm:right-6 sm:bottom-6 sm:top-auto sm:w-96"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-10 rounded-full bg-canvas/90 hover:bg-surface-1"
        aria-label={isEnglish ? "Close" : "Tutup"}
        aria-busy={acknowledge.isPending}
        disabled={acknowledge.isPending}
        onClick={() =>
          acknowledge.mutate(gifts.map(({ id: giftId }) => giftId))
        }
      >
        {acknowledge.isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 motion-safe:animate-spin"
          />
        ) : (
          <X aria-hidden="true" className="size-5" />
        )}
      </Button>
      <GiftReveal />
      <div role="status" className="text-center">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
          {isEnglish ? "You got Sydia Plus!" : "Kamu dapat Sydia Plus!"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {isEnglish ? (
            <>
              You received{" "}
              <strong className="font-semibold text-ink">
                {duration} {dayUnit}
              </strong>{" "}
              as a gift. Enjoy Plus through {date}.
            </>
          ) : (
            <>
              Kamu mendapat hadiah{" "}
              <strong className="font-semibold text-ink">
                {duration} hari
              </strong>
              . Nikmati Plus hingga {date}.
            </>
          )}
        </p>
      </div>
      {acknowledge.isError && (
        <p role="alert" className="mt-3 text-center text-sm text-destructive">
          {isEnglish
            ? "Couldn’t dismiss the gift. Try again."
            : "Hadiah belum dapat ditutup. Coba lagi."}
        </p>
      )}
    </aside>
  );
}
