import type { ReactNode } from "react";
import { SydiaLogo } from "@/components/ui/sydia-logo";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(22rem,0.82fr)_minmax(28rem,1.18fr)]">
      <aside
        className="relative isolate hidden overflow-hidden border-r border-ink/8 bg-canvas px-10 py-10 lg:flex lg:flex-col xl:px-16"
        aria-label="Tentang Sydia"
      >
        <SydiaLogo className="pointer-events-none absolute -right-28 -bottom-32 size-[390px] rotate-[-12deg] opacity-[0.14] xl:-right-32 xl:size-[440px] xl:opacity-[0.16]" />

        <div className="relative z-10 flex items-center gap-2.5 font-display text-base font-bold text-ink">
          <SydiaLogo className="h-8" />
          <span>Sydia</span>
        </div>

        <div className="relative z-10 my-auto max-w-lg py-12">
          <p className="font-display text-[42px] leading-[1.1] font-bold tracking-[-0.03em] text-ink xl:text-[48px]">
            Ngobrol seperti biasa, tanpa instruksi rumit
          </p>
          <p className="mt-5 max-w-[39ch] text-[16px] leading-relaxed text-ink-muted">
            Sampaikan melalui chat, Sydia yang urus sisanya
          </p>

          <ol aria-label="Contoh percakapan" className="mt-10 space-y-4">
            <li className="flex justify-end">
              <article
                aria-label="Pesan Anda"
                className="max-w-[82%] rounded-md rounded-br-sm bg-surface-1 px-4 py-3 text-[15px] leading-6 text-ink-soft"
              >
                Ingatkan aku bayar listrik Jumat jam 9 pagi.
              </article>
            </li>
            <li className="flex items-start gap-2.5">
              <SydiaLogo className="mt-1 h-7" />
              <article
                aria-label="Jawaban Sydia"
                className="max-w-[82%] rounded-md rounded-tl-sm border border-ink/8 bg-background px-4 py-3 text-[15px] leading-6 text-ink"
              >
                Siap, pengingat bayar listrik untuk Jumat pukul 09.00 sudah
                dibuat.
              </article>
            </li>
          </ol>
        </div>
      </aside>

      <section
        className="flex items-start justify-center px-6 py-10 sm:px-10 lg:items-center lg:px-14"
        aria-labelledby="auth-title"
      >
        <div className="w-full max-w-md">
          <div className="mb-16 flex items-center gap-2.5 font-display text-base font-bold text-ink lg:hidden">
            <SydiaLogo className="h-8" />
            <span>Sydia</span>
          </div>
          <header className="mb-8 space-y-3">
            <h1
              id="auth-title"
              className="font-display text-[32px] leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-[40px]"
            >
              {title}
            </h1>
            <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-muted">
              {description}
            </p>
          </header>
          {children}
          <div className="mt-8 border-t border-ink/8 pt-6 text-sm text-ink-muted">
            {footer}
          </div>
        </div>
      </section>
    </main>
  );
}
