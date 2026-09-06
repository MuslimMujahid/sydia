import type { ReactNode } from "react";
import { ShowcaseSection } from "./section";

type TypeRow = { name: string; meta: string; sample: ReactNode };

const DISPLAY_ROWS: TypeRow[] = [
  {
    name: "Display XL",
    meta: "Figtree · 64 / 70.4 — 800",
    sample: (
      <span className="font-display text-[44px] leading-[1.1] font-bold tracking-[-0.03em] lg:text-[64px] lg:leading-[1.02] lg:tracking-[-0.04em]">
        Anda yang lebih mampu
      </span>
    ),
  },
  {
    name: "Display MD",
    meta: "Figtree · 48 / 52.8 — 700",
    sample: (
      <span className="font-display text-[44px] leading-[1.1] font-bold tracking-[-0.03em]">
        Ubah ide menjadi kemajuan
      </span>
    ),
  },
  {
    name: "Heading LG",
    meta: "Figtree · 36.8 / 40.48 — 800",
    sample: (
      <span className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.03em]">
        Pendamping AI Anda
      </span>
    ),
  },
  {
    name: "Heading MD",
    meta: "Figtree · 32 / 35.2 — 700",
    sample: (
      <span className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
        Rencanakan, ciptakan, dan capai
      </span>
    ),
  },
  {
    name: "Heading SM",
    meta: "Figtree · 24 / 26.4 — 700",
    sample: (
      <span className="font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]">
        Lebih cerdas bersama
      </span>
    ),
  },
];

const BODY_ROWS: TypeRow[] = [
  {
    name: "Body LG",
    meta: "Instrument Sans · 18 / 27 — 400",
    sample: (
      <span className="font-sans text-[17px] leading-[1.6] tracking-[-0.005em]">
        Sydia membantu Anda berpikir jernih, bergerak cepat, dan melakukan lebih
        banyak.
      </span>
    ),
  },
  {
    name: "Body MD",
    meta: "Instrument Sans · 16 / 24 — 400",
    sample: (
      <span className="font-sans text-[15px] leading-[1.6] tracking-[-0.005em]">
        Asisten AI pribadi untuk pekerjaan dan kehidupan.
      </span>
    ),
  },
  {
    name: "Body SM",
    meta: "Instrument Sans · 14 / 21 — 400",
    sample: (
      <span className="font-sans text-sm leading-[21px]">
        Detail kecil. Kemajuan besar.
      </span>
    ),
  },
  {
    name: "Eyebrow Mono",
    meta: "Martian Mono · 16 / 24 — 400",
    sample: (
      <span className="font-mono text-[13px] leading-none font-medium uppercase">
        Dibuat untuk manusia
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
      title="Tipografi"
      tagline="Hierarki jelas. Suara teknis yang tenang."
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
