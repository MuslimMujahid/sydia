import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(20rem,0.8fr)_minmax(32rem,1.2fr)]">
      <section
        className="relative hidden overflow-hidden bg-canvas-dark p-12 text-canvas lg:flex lg:flex-col lg:justify-between"
        aria-label="About Sydia"
      >
        <div className="flex items-center gap-3 font-mono text-sm tracking-widest uppercase">
          <Sparkles className="size-5 text-brand" />
          Sydia
        </div>
        <div className="max-w-lg space-y-6">
          <p className="font-mono text-xs tracking-widest text-brand uppercase">
            Personal operations, clearly indexed
          </p>
          <p className="font-display text-5xl leading-[1.06] font-extrabold">
            Capture in conversation. Correct in one calm place.
          </p>
          <p className="text-lg text-canvas/70">
            Sydia turns messages into inspectable state, while you stay in
            control of what is remembered and changed.
          </p>
        </div>
        <p className="font-mono text-xs text-canvas/50 uppercase">
          WhatsApp first · Web control center
        </p>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <span className="font-mono text-sm tracking-widest text-ink uppercase">
              Sydia
            </span>
          </div>
          <header className="mb-8 space-y-3">
            <p className="font-mono text-xs tracking-widest text-link uppercase">
              {eyebrow}
            </p>
            <h1 className="font-display text-4xl leading-tight font-extrabold text-ink sm:text-5xl">
              {title}
            </h1>
            <p className="text-lg text-ink-muted">{description}</p>
          </header>
          {children}
          <div className="mt-8 border-t border-surface-1 pt-6 text-sm text-ink-muted">
            {footer}
          </div>
        </div>
      </section>
    </main>
  );
}
