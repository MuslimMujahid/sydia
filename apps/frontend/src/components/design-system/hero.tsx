import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SydiaLogo } from "@/components/ui/sydia-logo";

const NAV_WORDS = ["Pikirkan", "Rencanakan", "Ciptakan", "Bersama"];
const SIDE_WORDS = ["Ide", "Tindakan", "Kemajuan"];

function HeroBand() {
  return (
    <header className="aurora-gradient relative overflow-hidden text-canvas">
      <nav
        aria-label="Sistem desain"
        className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"
      >
        <span className="flex items-center gap-3 font-mono text-base leading-6 tracking-widest uppercase">
          <SydiaLogo className="h-7" />
          Sydia
        </span>
        <ul className="hidden items-center gap-8 sm:flex">
          {NAV_WORDS.map((word) => (
            <li
              key={word}
              className="font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-canvas uppercase"
            >
              {word}
            </li>
          ))}
        </ul>
      </nav>
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-10 px-6 pt-12 pb-16 lg:px-10 lg:pt-24 lg:pb-24">
        <div className="max-w-2xl space-y-6">
          <h1 className="font-display text-[44px] leading-[1.1] font-bold tracking-[-0.03em] lg:text-[64px] lg:leading-[1.02] lg:tracking-[-0.04em]">
            Sistem Desain Sydia
          </h1>
          <p className="font-sans text-xl leading-[1.22] font-semibold tracking-[-0.018em] text-canvas">
            Platform Asisten AI Pribadi
          </p>
          <p className="font-sans text-[15px] leading-[1.6] text-canvas">
            Antarmuka kanvas terbagi, nuansa merek teal-sian, permukaan gelap
            editorial, dan suara teknis yang tenang.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button variant="primary">
              <Sparkles />
              Tanya Sydia
            </Button>
            <Button variant="dark-outline">Lihat Panduan</Button>
          </div>
        </div>
        <div className="hidden flex-col items-end gap-6 lg:flex">
          <Eyebrow
            variant="muted"
            className="max-w-24 text-right text-canvas/50"
          >
            Anda yang lebih mampu
          </Eyebrow>
          <ul className="space-y-1 text-right">
            {SIDE_WORDS.map((word) => (
              <li
                key={word}
                className="font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-canvas uppercase"
              >
                {word}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
}

export { HeroBand };
