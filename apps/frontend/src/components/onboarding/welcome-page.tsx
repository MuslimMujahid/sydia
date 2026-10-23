import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import {
  billingLanguage,
  type BillingLanguage,
} from "@/components/settings/billing-copy";
import { buttonVariants } from "@/components/ui/button";
import {
  billingStatusQueryOptions,
  type BillingStatus,
} from "@/lib/services/api/billing/billing.api";

export type WelcomeReason = "trial" | "ready" | "paid";

const COPY: Record<
  BillingLanguage,
  {
    processing: Record<WelcomeReason, { title: string; steps: string[] }>;
    title: Record<WelcomeReason, string>;
    body: string;
    start: string;
    stalledTitle: string;
    stalledBody: string;
    stalledAction: string;
  }
> = {
  id: {
    processing: {
      trial: {
        title: "Menyiapkan Sydia untuk Anda",
        steps: [
          "Menyimpan pengaturan Anda",
          "Mengaktifkan trial gratis",
          "Hampir selesai",
        ],
      },
      ready: {
        title: "Menyiapkan Sydia untuk Anda",
        steps: [
          "Menyimpan pengaturan Anda",
          "Menyesuaikan asisten",
          "Hampir selesai",
        ],
      },
      paid: {
        title: "Memproses pembayaran Anda",
        steps: [
          "Memastikan pembayaran diterima",
          "Mengaktifkan Sydia Plus",
          "Hampir selesai",
        ],
      },
    },
    title: {
      trial: "Trial sudah aktif",
      ready: "Semuanya sudah siap",
      paid: "Pembayaran berhasil. Langganan sudah aktif",
    },
    body: "Selamat menikmati Sydia.",
    start: "Mulai chat dengan Sydia",
    stalledTitle: "Pembayaran Anda masih diproses",
    stalledBody:
      "Biasanya hanya butuh beberapa saat. Langganan Anda akan aktif begitu pembayaran terkonfirmasi.",
    stalledAction: "Lihat langganan",
  },
  en: {
    processing: {
      trial: {
        title: "Getting Sydia ready for you",
        steps: [
          "Saving your settings",
          "Starting your free trial",
          "Almost done",
        ],
      },
      ready: {
        title: "Getting Sydia ready for you",
        steps: ["Saving your settings", "Tuning your assistant", "Almost done"],
      },
      paid: {
        title: "Processing your payment",
        steps: [
          "Confirming your payment",
          "Activating Sydia Plus",
          "Almost done",
        ],
      },
    },
    title: {
      trial: "Your trial is active",
      ready: "Everything is set",
      paid: "Payment successful. Your subscription is active",
    },
    body: "Enjoy Sydia.",
    start: "Start chatting with Sydia",
    stalledTitle: "Your payment is still processing",
    stalledBody:
      "It usually takes a moment. Your subscription turns on as soon as the payment is confirmed.",
    stalledAction: "View subscription",
  },
};

/** The loading scene stays at least this long, even when nothing is slow. */
export const WELCOME_MINIMUM_MS = 2_400;
const STEP_INTERVAL_MS = 900;
const PAYMENT_STALLED_MS = 30_000;
const PAYMENT_POLL_MS = 2_000;

const isPaid = (billing: BillingStatus | undefined) =>
  billing?.state === "paid";

interface WelcomePageProps {
  locale: string;
  reason: WelcomeReason;
}

/**
 * Closing scene of onboarding and checkout: a short processing screen that is
 * always shown, then the celebration. After a payment it also waits until the
 * subscription is really active.
 */
export function WelcomePage({ locale, reason }: WelcomePageProps) {
  const language = billingLanguage(locale);
  const text = COPY[language];
  const processing = text.processing[reason];
  const [step, setStep] = useState(0);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [stalled, setStalled] = useState(false);
  const status = useQuery({
    ...billingStatusQueryOptions(),
    enabled: reason === "paid",
    refetchInterval: (query) =>
      isPaid(query.state.data) ? false : PAYMENT_POLL_MS,
  });

  useEffect(() => {
    const stepTimer = window.setInterval(
      () =>
        setStep((current) =>
          Math.min(current + 1, processing.steps.length - 1)
        ),
      STEP_INTERVAL_MS
    );

    const minimumTimer = window.setTimeout(
      () => setMinimumElapsed(true),
      WELCOME_MINIMUM_MS
    );

    const stalledTimer = window.setTimeout(
      () => setStalled(true),
      PAYMENT_STALLED_MS
    );

    return () => {
      window.clearInterval(stepTimer);
      window.clearTimeout(minimumTimer);
      window.clearTimeout(stalledTimer);
    };
  }, [processing.steps.length]);

  const confirmed = reason !== "paid" || isPaid(status.data);

  if (minimumElapsed && confirmed)
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6">
        <section
          role="status"
          className="mx-auto max-w-md text-center animate-in duration-500 fade-in slide-in-from-bottom-3 motion-reduce:animate-none"
        >
          <span className="mx-auto flex size-16 items-center justify-center rounded-pill bg-brand/12 text-brand-deep">
            <Check className="size-8" aria-hidden="true" />
          </span>
          <h1 className="mt-8 font-display text-[32px] leading-[1.15] font-bold tracking-[-0.03em] text-ink sm:text-[40px]">
            {text.title[reason]}
          </h1>
          <p className="mt-3 text-lg text-ink-muted">{text.body}</p>
          <Link
            to="/"
            search={{ conversation: undefined, attachment: undefined }}
            className={buttonVariants({
              variant: "secondary",
              className: "mt-10",
            })}
          >
            {text.start}
          </Link>
        </section>
      </main>
    );

  if (minimumElapsed && stalled)
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6">
        <section role="status" className="mx-auto max-w-md text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">
            {text.stalledTitle}
          </h1>
          <p className="mt-3 text-ink-muted">{text.stalledBody}</p>
          <Link
            to="/settings/billing"
            className={buttonVariants({
              variant: "secondary",
              className: "mt-8",
            })}
          >
            {text.stalledAction}
          </Link>
        </section>
      </main>
    );

  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="grid min-h-screen place-items-center bg-background px-6"
    >
      <div className="text-center">
        <p className="font-display text-xl font-semibold text-ink">
          {processing.title}
        </p>
        <p className="mt-2 text-ink-muted">{processing.steps[step]}</p>
      </div>
    </main>
  );
}
