import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

const NAV_WORDS = ["Think", "Plan", "Create", "Together"];
const SIDE_WORDS = ["Ideas", "Actions", "Progress"];

function HeroBand() {
  return (
    <header className="relative overflow-hidden bg-canvas-dark text-canvas">
      {/* Brand voltage glow arc */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -bottom-72 size-[560px] rounded-full opacity-80"
        style={{
          background:
            "radial-gradient(closest-side, transparent 62%, rgba(50, 230, 226, 0.55) 78%, rgba(50, 230, 226, 0.12) 92%, transparent 100%)",
        }}
      />
      <nav
        aria-label="Design system"
        className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10"
      >
        <span className="font-mono text-base leading-6 tracking-widest uppercase">
          Sydia
        </span>
        <ul className="hidden items-center gap-8 sm:flex">
          {NAV_WORDS.map((word) => (
            <li
              key={word}
              className="font-mono text-xs leading-[18px] tracking-widest text-canvas/70 uppercase"
            >
              {word}
            </li>
          ))}
        </ul>
      </nav>
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-10 px-6 pt-16 pb-20 lg:px-10 lg:pt-24">
        <div className="max-w-2xl space-y-6">
          <h1 className="font-display text-5xl leading-[1.1] font-extrabold lg:text-[64px] lg:leading-[70.4px]">
            Sydia Design System
          </h1>
          <p className="font-sans text-2xl leading-8 text-canvas/90">
            Personal AI Assistant Platform
          </p>
          <p className="font-sans text-lg leading-[27px] text-canvas/60">
            Split-canvas interface, teal-cyan brand voltage, editorial dark
            surfaces, and a calm technical voice.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button variant="primary">
              <Sparkles />
              Ask Sydia
            </Button>
            <Button variant="dark-outline">View Guidelines</Button>
          </div>
        </div>
        <div className="hidden flex-col items-end gap-6 lg:flex">
          <Eyebrow
            variant="muted"
            className="max-w-24 text-right text-canvas/50"
          >
            A more capable you
          </Eyebrow>
          <ul className="space-y-1 text-right">
            {SIDE_WORDS.map((word) => (
              <li
                key={word}
                className="font-mono text-xs leading-[18px] tracking-widest text-canvas/70 uppercase"
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
