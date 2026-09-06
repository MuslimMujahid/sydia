import type { ReactNode } from "react";

type ShowcaseSectionProps = {
  number: string;
  title: string;
  tagline?: string;
  children: ReactNode;
};

function ShowcaseSection({
  number,
  title,
  tagline,
  children,
}: ShowcaseSectionProps) {
  return (
    <section
      aria-labelledby={`section-${number}`}
      className="rounded-lg border border-ink/6 bg-canvas p-6 shadow-card lg:p-8"
    >
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={`section-${number}`}
          className="font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em] text-ink"
        >
          {number}. {title}
        </h2>
        {tagline ? (
          <p className="font-mono text-xs leading-[18px] text-ink-weak uppercase">
            {tagline}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

type SpecimenProps = {
  number?: string;
  title: string;
  description: string;
  children: ReactNode;
};

function Specimen({ number, title, description, children }: SpecimenProps) {
  return (
    <div className="flex flex-col rounded-md border border-ink/6 bg-canvas p-5 shadow-card">
      <div className="mb-4">
        <h3 className="font-mono text-sm leading-[21px] text-ink uppercase">
          {number ? `${number}. ` : ""}
          {title}
        </h3>
        <p className="font-mono text-xs leading-[18px] text-ink-weak uppercase">
          {description}
        </p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3">
        {children}
      </div>
    </div>
  );
}

export { ShowcaseSection, Specimen };
export type { ShowcaseSectionProps, SpecimenProps };
