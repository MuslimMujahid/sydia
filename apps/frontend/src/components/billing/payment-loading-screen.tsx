import { useEffect, useState } from "react";
import type { BillingLanguage } from "@/components/settings/billing-copy";

const COPY = {
  id: {
    title: "Menyiapkan pembayaran Anda",
    steps: [
      "Membuat tagihan yang aman",
      "Menghubungkan ke Mayar",
      "Hampir selesai",
    ],
  },
  en: {
    title: "Preparing your payment",
    steps: ["Creating a secure invoice", "Connecting to Mayar", "Almost done"],
  },
} as const;

const STEP_INTERVAL_MS = 1_800;

interface PaymentLoadingScreenProps {
  language: BillingLanguage;
}

/** Full-screen hand-off shown while the invoice is created. */
export function PaymentLoadingScreen({ language }: PaymentLoadingScreenProps) {
  const text = COPY[language];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, text.steps.length - 1)),
      STEP_INTERVAL_MS
    );

    return () => window.clearInterval(timer);
  }, [text.steps.length]);

  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background px-6"
    >
      <div>
        <p className="font-display text-xl font-semibold text-ink">
          {text.title}
        </p>
        <p className="mt-2 text-ink-muted">{text.steps[step]}</p>
      </div>
    </main>
  );
}
