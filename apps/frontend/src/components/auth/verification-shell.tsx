import type { CSSProperties, ReactNode } from "react";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import { AuthInteractive } from "./auth-interactive";
import "./auth.css";

interface VerificationShellProps {
  screen?: AuthScreen;
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

// Positions measured on the live 1440×960 and 390 px Penpot boards.
const screenPositions = {
  verify: [144, 213],
  legacy: [132, 163],
  "change-email": [132, 136],
  "verify-email": [144, 257],
  "email-updated": [168, 315],
  forgot: [144, 269],
  "reset-verify": [144, 237],
  "reset-password": [144, 242],
  "reset-done": [168, 350],
  "google-collision": [132, 189],
  "link-google": [144, 233],
  "change-email-google": [132, 262],
  "change-email-after-google": [132, 267],
  recovery: [136, 212],
} as const;

export type AuthScreen = keyof typeof screenPositions;

export function VerificationShell({
  title,
  description,
  children,
  footer,
  screen = "verify",
}: VerificationShellProps) {
  return (
    <main
      className="auth-surface min-h-svh bg-background px-6 pb-12"
      style={
        {
          "--auth-mobile-top": `${screenPositions[screen][0]}px`,
          "--auth-desktop-top": `${screenPositions[screen][1]}px`,
        } as CSSProperties
      }
    >
      <div className="mx-auto w-full max-w-md">
        <div className="pt-[26px] lg:pt-12">
          <div className="flex h-8 items-center gap-2.5 text-[23px] leading-8 font-bold">
            <SydiaLogo className="size-[30px] lg:size-8" />
            <span>Sydia</span>
          </div>
        </div>
        <section aria-labelledby="verification-title" className="auth-content">
          <header className="mb-7 space-y-2">
            <h1
              id="verification-title"
              className="font-display text-[30px] leading-[43px] font-bold lg:text-[38px] lg:leading-[54px]"
            >
              {title}
            </h1>
            {description && (
              <div className="text-[15px] leading-[22px] text-ink-muted">
                {description}
              </div>
            )}
          </header>
          <AuthInteractive>{children}</AuthInteractive>
          {footer && (
            <div className="mt-[38px] border-t border-ink/8 pt-1.5 text-sm font-semibold underline underline-offset-4">
              <div className="flex min-h-11 items-center">{footer}</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
