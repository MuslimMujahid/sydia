import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import {
  billingLanguage,
  type BillingLanguage,
} from "@/components/settings/billing-copy";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  billingStatusQueryOptions,
  type BillingStatus,
} from "@/lib/services/api/billing/billing.api";

import { FormError } from "@/components/forms/form-fields";
import { useQueueConversationMessage } from "@/lib/services/api/conversations/conversations.queries";
import { PERSONA_OPTIONS } from "./personas";
import type { AssistantPersona } from "@/lib/services/api/users/preferences.api";

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
    start: "Katakan Hai",
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
    start: "Say Hi",
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
  name?: string;
  persona?: AssistantPersona;
}

/**
 * Closing scene of onboarding and checkout: a short processing screen that is
 * always shown, then the celebration. After a payment it also waits until the
 * subscription is really active.
 */
export function WelcomePage({
  locale,
  reason,
  name,
  persona = "professional",
}: WelcomePageProps) {
  const navigate = useNavigate();
  const queueMessage = useQueueConversationMessage();
  const startKey = useRef<string | undefined>(undefined);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();

  async function startChat() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(undefined);
    startKey.current ??= crypto.randomUUID();

    try {
      const result =
        queueMessage.data ??
        (await queueMessage.mutateAsync({
          content:
            locale === "en"
              ? "Hi Sydia, nice to meet you. What could you help me with?"
              : "Hai Sydia, salam kenal. Kamu bisa bantu apa aja?",
          idempotencyKey: startKey.current,
        }));

      await navigate({
        to: "/",
        search: { conversation: result.conversation.id, attachment: undefined },
      });
    } catch (error) {
      console.error("Welcome conversation could not be opened", error);
      setStartError(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Your conversation could not be started. Try again."
            : "Percakapan belum dapat dimulai. Coba lagi."
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  const language = billingLanguage(locale);
  const text = COPY[language];
  const processing = text.processing[reason];
  const [step, setStep] = useState(0);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [paused, setPaused] = useState(false);
  const avatar = PERSONA_OPTIONS.find((option) => option.value === persona)!;
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", update);

    return () => document.removeEventListener("visibilitychange", update);
  }, []);
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
      <main
        className="welcome-scene relative isolate grid min-h-svh place-items-center overflow-hidden bg-background px-6 py-16"
        data-paused={paused}
      >
        <div
          className="welcome-aurora pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>
        <div
          className="welcome-confetti pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        >
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              className={index % 5 === 0 ? "welcome-spark" : undefined}
              style={{
                left: `${20 + ((index * 37) % 62)}%`,
                top: `${14 + ((index * 23) % 63)}%`,
                color: ["#ef5a8a", "#8c5cff", "#ffb27a"][index % 3],
                animationDelay: `${-(index * 0.7)}s`,
                animationDuration: `${5 + (index % 4)}s`,
                rotate: `${index * 31}deg`,
              }}
            />
          ))}
        </div>
        <section
          role="status"
          className="welcome-content mx-auto w-full max-w-[680px] text-center"
        >
          <div className="welcome-avatar relative mx-auto size-[132px] rounded-full p-1.5 sm:size-[152px]">
            <img
              src={avatar.image}
              alt=""
              className="size-full rounded-full border-4 border-white object-cover"
            />
            <span className="absolute right-0 bottom-0 flex size-11 items-center justify-center rounded-full border-[3px] border-white bg-brand text-white">
              <Check className="size-6" aria-hidden="true" />
            </span>
          </div>
          <h1 className="mt-10 text-balance font-display text-[36px] leading-[1.08] font-bold tracking-[-0.04em] text-ink sm:text-[56px]">
            {reason === "paid" ? (
              text.title[reason]
            ) : (
              <>
                {language === "id"
                  ? `Halo${name ? `, ${name}` : ""}! `
                  : `Hello${name ? `, ${name}` : ""}! `}
                <span className="text-[#a82859]">
                  {language === "id" ? "Sydia siap" : "Sydia is ready"}
                </span>
                {language === "id" ? " menemanimu." : " to help you."}
              </>
            )}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">
            {reason === "paid"
              ? text.body
              : language === "id"
                ? "Pengaturanmu sudah tersimpan. Mulai dengan satu pesan sederhana, Sydia yang urus sisanya."
                : "Your settings are saved. Start with one simple message, and let Sydia take care of the rest."}
          </p>
          <Button
            type="button"
            className="mt-10 gap-3"
            disabled={starting}
            onClick={() => void startChat()}
          >
            {starting
              ? language === "id"
                ? "Membuka percakapan…"
                : "Opening conversation…"
              : text.start}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          {startError && (
            <div className="mx-auto mt-4 max-w-md">
              <FormError message={startError} />
            </div>
          )}
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
