import type { ReactNode } from "react";
import { SydiaLogo } from "@/components/ui/sydia-logo";

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
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(20rem,0.8fr)_minmax(32rem,1.2fr)]">
      <section
        className="aurora-gradient relative hidden overflow-hidden p-12 text-canvas lg:flex lg:flex-col lg:justify-between"
        aria-label="Tentang Sydia"
      >
        <div className="flex items-center gap-3 font-mono text-sm tracking-widest uppercase">
          <SydiaLogo className="h-6" />
          Sydia
        </div>
        <div className="max-w-lg space-y-6">
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-canvas uppercase">
            Aktivitas pribadi, tertata jelas
          </p>
          <p className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.03em]">
            Catat lewat percakapan. Kelola dengan tenang di satu tempat.
          </p>
          <p className="text-[17px] leading-[1.6] text-canvas">
            Sydia mengubah pesan menjadi informasi yang dapat Anda tinjau,
            sementara Anda tetap mengendalikan apa yang disimpan dan diubah.
          </p>
        </div>
        <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-canvas uppercase">
          Utamakan WhatsApp · Pusat kendali web
        </p>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <span className="flex items-center gap-3 font-mono text-sm tracking-widest text-ink uppercase">
              <SydiaLogo className="h-6" />
              Sydia
            </span>
          </div>
          <header className="mb-8 space-y-3">
            <p className="font-mono text-[13px] font-medium tracking-widest text-ink-muted uppercase">
              {eyebrow}
            </p>
            <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] text-ink sm:text-[44px] sm:leading-[1.1] sm:font-bold sm:tracking-[-0.03em]">
              {title}
            </h1>
            <p className="text-[15px] leading-[1.6] text-ink-muted">
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
