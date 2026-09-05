import type { ReactNode } from "react";
import { ShowcaseSection } from "./section";

type TypeRow = { name: string; meta: string; sample: ReactNode };

const DISPLAY_ROWS: TypeRow[] = [
  {
    name: "Display XL",
    meta: "Figtree · 64 / 70.4 — 800",
    sample: (
      <span className="font-display text-[64px] leading-[70.4px] font-extrabold">
        A more capable you
      </span>
    ),
  },
  {
    name: "Display MD",
    meta: "Figtree · 48 / 52.8 — 700",
    sample: (
      <span className="font-display text-5xl leading-[52.8px] font-bold">
        Turn ideas into progress
      </span>
    ),
  },
  {
    name: "Heading LG",
    meta: "Figtree · 36.8 / 40.48 — 800",
    sample: (
      <span className="font-display text-4xl leading-10 font-extrabold">
        Your AI companion
      </span>
    ),
  },
  {
    name: "Heading MD",
    meta: "Figtree · 32 / 35.2 — 700",
    sample: (
      <span className="font-display text-[32px] leading-[35.2px] font-bold">
        Plan, create, and achieve
      </span>
    ),
  },
  {
    name: "Heading SM",
    meta: "Figtree · 24 / 26.4 — 700",
    sample: (
      <span className="font-display text-2xl leading-[26.4px] font-bold">
        Smarter together
      </span>
    ),
  },
];

const BODY_ROWS: TypeRow[] = [
  {
    name: "Body LG",
    meta: "Instrument Sans · 18 / 27 — 400",
    sample: (
      <span className="font-sans text-lg leading-[27px]">
        Sydia helps you think clearly, move faster, and do more.
      </span>
    ),
  },
  {
    name: "Body MD",
    meta: "Instrument Sans · 16 / 24 — 400",
    sample: (
      <span className="font-sans text-base leading-6">
        A personal AI assistant for work and life.
      </span>
    ),
  },
  {
    name: "Body SM",
    meta: "Instrument Sans · 14 / 21 — 400",
    sample: (
      <span className="font-sans text-sm leading-[21px]">
        Small details. Big progress.
      </span>
    ),
  },
  {
    name: "Eyebrow Mono",
    meta: "Martian Mono · 16 / 24 — 400",
    sample: (
      <span className="font-mono text-base leading-6 uppercase">
        Built for humans
      </span>
    ),
  },
  {
    name: "Code Mono",
    meta: "Martian Mono · 12 / 18 — 400",
    sample: (
      <span className="font-mono text-xs leading-[18px]">
        const progress = together();
      </span>
    ),
  },
];

function TypeSpecimen({ row }: { row: TypeRow }) {
  return (
    <div className="border-b border-surface-1 py-4 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6">
        <p className="font-sans text-base leading-6 text-ink">{row.name}</p>
        <p className="font-sans text-sm leading-[21px] text-ink-weak">
          {row.meta}
        </p>
      </div>
      <p className="mt-2 text-ink">{row.sample}</p>
    </div>
  );
}

function TypographySection() {
  return (
    <ShowcaseSection
      number="02"
      title="Typography"
      tagline="Clear hierarchy. A calm, technical voice."
    >
      <div className="space-y-2">
        {DISPLAY_ROWS.map((row) => (
          <TypeSpecimen key={row.name} row={row} />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {BODY_ROWS.map((row) => (
          <TypeSpecimen key={row.name} row={row} />
        ))}
      </div>
    </ShowcaseSection>
  );
}

export { TypographySection };
