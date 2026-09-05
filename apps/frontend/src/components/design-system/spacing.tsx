import { ShowcaseSection } from "./section";

const SCALE: { name: string; px: number }[] = [
  { name: "XS", px: 4 },
  { name: "SM", px: 8 },
  { name: "Base", px: 12 },
  { name: "MD", px: 16 },
  { name: "LG", px: 24 },
  { name: "XL", px: 32 },
  { name: "2XL", px: 48 },
  { name: "3XL", px: 64 },
  { name: "4XL", px: 96 },
];

const COLUMNS = Array.from({ length: 12 }, (_, i) => i + 1);

function SpacingSection() {
  return (
    <ShowcaseSection
      number="03"
      title="Spacing & Layout"
      tagline="Structured for clarity."
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 font-mono text-xs leading-[18px] text-ink-soft uppercase">
            Spacing scale (px)
          </h3>
          <ul className="space-y-2">
            {SCALE.map((step) => (
              <li
                key={step.name}
                className="flex items-center gap-4 border-b border-surface-1 pb-2 last:border-0"
              >
                <span className="w-10 font-sans text-sm leading-[21px] text-ink">
                  {step.name}
                </span>
                <span
                  aria-hidden="true"
                  className="h-3 rounded-xs bg-brand/70"
                  style={{ width: step.px }}
                />
                <span className="font-sans text-sm leading-[21px] text-ink-weak">
                  {step.px}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-4 font-mono text-xs leading-[18px] text-ink-soft uppercase">
            12-column desktop layout
          </h3>
          <div className="rounded-md border border-surface-1 bg-surface-1/40 p-4">
            <div className="grid grid-cols-12 gap-2" aria-hidden="true">
              {COLUMNS.map((column) => (
                <div key={column} className="h-24 rounded-xs bg-surface-2" />
              ))}
            </div>
            <p className="mt-3 font-sans text-sm leading-[21px] text-ink-muted">
              12 columns | 24px gutters | 1280px container
            </p>
          </div>
          <p className="mt-4 rounded-md bg-surface-1/60 p-4 font-sans text-sm leading-[21px] text-ink-muted">
            Use a consistent spacing scale for a clean, comfortable rhythm
            across all layouts.
          </p>
        </div>
      </div>
    </ShowcaseSection>
  );
}

export { SpacingSection };
