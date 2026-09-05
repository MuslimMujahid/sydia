import { ShowcaseSection } from "./section";

type Swatch = {
  name: string;
  hex: string;
  className: string;
  bordered?: boolean;
};

type SwatchGroup = { label: string; swatches: Swatch[] };

const GROUPS: SwatchGroup[] = [
  {
    label: "Brand",
    swatches: [
      { name: "Primary", hex: "#32E6E2", className: "bg-brand" },
      { name: "Primary Hover", hex: "#8EFBF7", className: "bg-brand-hover" },
      { name: "Primary Deep", hex: "#05BDBA", className: "bg-brand-deep" },
    ],
  },
  {
    label: "Surface",
    swatches: [
      {
        name: "Canvas",
        hex: "#FFFFFF",
        className: "bg-canvas",
        bordered: true,
      },
      { name: "Surface 1", hex: "#E4F0FB", className: "bg-surface-1" },
      { name: "Surface 2", hex: "#D0FFFE", className: "bg-surface-2" },
      { name: "Hairline", hex: "#D1D5DA", className: "bg-hairline" },
    ],
  },
  {
    label: "Text",
    swatches: [
      { name: "Ink", hex: "#181A1C", className: "bg-ink" },
      { name: "Ink Soft", hex: "#353A3E", className: "bg-ink-soft" },
      { name: "Ink Muted", hex: "#545A61", className: "bg-ink-muted" },
      { name: "Ink Weak", hex: "#778089", className: "bg-ink-weak" },
    ],
  },
  {
    label: "Accent / Status",
    swatches: [
      { name: "Secondary", hex: "#0C2A2A", className: "bg-editorial" },
      {
        name: "Secondary Deep",
        hex: "#014847",
        className: "bg-editorial-deep",
      },
      { name: "Link", hex: "#2E51ED", className: "bg-link" },
      { name: "Warn", hex: "#F98E21", className: "bg-warn" },
    ],
  },
];

function ColorSwatch({ swatch }: { swatch: Swatch }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`size-14 shrink-0 rounded-md ${swatch.className}${swatch.bordered ? " border border-hairline" : ""}`}
      />
      <div>
        <p className="font-sans text-base leading-6 text-ink">{swatch.name}</p>
        <p className="font-mono text-xs leading-[18px] text-ink-weak uppercase">
          {swatch.hex}
        </p>
      </div>
    </div>
  );
}

function ColorSystemSection() {
  return (
    <ShowcaseSection
      number="01"
      title="Color System"
      tagline="Tokens for a brighter, more capable tomorrow"
    >
      <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className="mb-4 font-mono text-xs leading-[18px] text-ink-soft uppercase">
              {group.label}
            </h3>
            <ul className="space-y-4">
              {group.swatches.map((swatch) => (
                <li key={swatch.name}>
                  <ColorSwatch swatch={swatch} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ShowcaseSection>
  );
}

export { ColorSystemSection };
