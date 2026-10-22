import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SydiaLogo } from "@/components/ui/sydia-logo";

export const SUPPORT_EMAIL = "muslim.mujahid22@gmail.com";

type PublicPageProps = {
  title: string;
  intro: string;
  children: ReactNode;
};

export function PublicPage({ title, intro, children }: PublicPageProps) {
  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-5 border-b border-ink/10 px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2.5 font-display text-2xl font-bold">
          <SydiaLogo className="size-8" /> Sydia
        </div>
        <Link
          to="/sign-in"
          search={{ redirect: undefined, reason: undefined }}
          className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-canvas"
        >
          Buka aplikasi
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-20">
        <header className="mb-12 max-w-2xl space-y-5">
          <h1 className="font-display text-4xl leading-tight font-bold sm:text-5xl">
            {title}
          </h1>
          <p className="text-lg leading-relaxed text-ink-muted">{intro}</p>
        </header>
        <div className="max-w-2xl space-y-10 text-base leading-relaxed [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_p+p]:mt-3 [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-5xl space-y-5 border-t border-ink/10 px-6 py-8 text-sm sm:px-10">
        <nav
          aria-label="Informasi Sydia"
          className="flex flex-wrap gap-x-6 gap-y-3 underline underline-offset-4"
        >
          <a href={`mailto:${SUPPORT_EMAIL}`}>Hubungi pengelola</a>
        </nav>
        <p className="text-ink-muted">
          Dukungan dan privasi:{" "}
          <a
            className="break-all underline underline-offset-4"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </footer>
    </div>
  );
}
