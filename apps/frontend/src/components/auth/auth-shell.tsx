import type { ReactNode } from "react";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import { cn } from "@/lib/utils/cn";
import { AuthInteractive } from "./auth-interactive";
import "./auth.css";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  mode?: "sign-in" | "sign-up";
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  mode = "sign-in",
}: AuthShellProps) {
  return (
    <main className="auth-surface grid min-h-svh bg-background lg:grid-cols-[minmax(22rem,0.82fr)_minmax(28rem,1.18fr)]">
      <aside
        className="relative isolate hidden overflow-hidden border-r border-ink/8 bg-canvas px-10 py-12 lg:flex lg:flex-col xl:px-16"
        aria-label="Tentang Sydia"
      >
        <div className="relative z-10 flex items-center gap-2.5 font-display text-[23px] font-bold text-ink">
          <SydiaLogo className="size-9" />
          <span>Sydia</span>
        </div>

        <div className="relative z-10 mt-[192px] max-w-lg">
          <p className="font-display text-[44px] leading-[1.45] font-bold text-ink">
            Ngobrol seperti biasa,
            <br />
            tanpa instruksi rumit
          </p>
          <p className="mt-[26px] text-[17px] leading-[1.45] text-ink-muted">
            Sampaikan melalui chat,
            <br />
            Sydia yang urus sisanya.
          </p>

          <ol aria-label="Contoh percakapan" className="mt-[62px] space-y-5">
            <li className="flex justify-end">
              <article
                aria-label="Pesan Anda"
                className="min-h-[74px] w-[calc(100%-24px)] rounded-md bg-background px-[18px] py-[14px] text-[15px] leading-[1.45] text-ink"
              >
                Ingatkan aku bayar listrik
                <br />
                Jumat jam 9 pagi.
              </article>
            </li>
            <li className="flex items-start gap-3.5">
              <SydiaLogo className="mt-1 h-7" />
              <article
                aria-label="Jawaban Sydia"
                className="min-h-[100px] flex-1 rounded-md bg-background px-[18px] py-[19px] text-[15px] leading-[1.45] text-ink"
              >
                Siap, pengingat bayar listrik untuk
                <br />
                Jumat pukul 09.00 sudah dibuat.
              </article>
            </li>
          </ol>
        </div>
        <p className="absolute bottom-16 text-[13px] leading-[19px] text-ink-muted">
          Asisten pribadi untuk keseharian Anda.
        </p>
      </aside>

      <section
        className={cn(
          "flex items-start justify-center px-6 pt-[26px] pb-20 sm:px-10 lg:px-14",
          mode === "sign-up" ? "lg:pt-20" : "lg:pt-44"
        )}
        aria-labelledby="auth-title"
      >
        <div className="w-full max-w-md">
          <div className="mb-[72px] flex items-center gap-2.5 font-display text-[23px] leading-[34px] font-bold text-ink lg:hidden">
            <SydiaLogo className="size-[30px]" />
            <span>Sydia</span>
          </div>
          <header className="mb-7 space-y-2">
            <h1
              id="auth-title"
              className="font-display text-[30px] leading-[43px] font-bold text-ink lg:text-[38px] lg:leading-[54px]"
            >
              {title}
            </h1>
            <p className="text-[15px] leading-[22px] text-ink-muted">
              {description}
            </p>
          </header>
          <AuthInteractive>{children}</AuthInteractive>
          <div className="mt-[38px] border-t border-ink/8 pt-3 text-sm font-semibold text-ink underline underline-offset-4">
            {footer}
          </div>
        </div>
      </section>
    </main>
  );
}
