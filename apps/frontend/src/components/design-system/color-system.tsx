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
    label: "Merek",
    swatches: [
      { name: "Utama", hex: "#32E6E2", className: "bg-brand" },
      {
        name: "Utama Saat Diarahkan",
        hex: "#8EFBF7",
        className: "bg-brand-hover",
      },
      { name: "Utama Dalam", hex: "#05BDBA", className: "bg-brand-deep" },
    ],
  },
  {
    label: "Permukaan",
    swatches: [
      {
        name: "Kanvas",
        hex: "#FFFFFF",
        className: "bg-canvas",
        bordered: true,
      },
      { name: "Permukaan 1", hex: "#E4F0FB", className: "bg-surface-1" },
      { name: "Permukaan 2", hex: "#D0FFFE", className: "bg-surface-2" },
      { name: "Garis Tipis", hex: "#D1D5DA", className: "bg-hairline" },
    ],
  },
  {
    label: "Teks",
    swatches: [
      { name: "Tinta", hex: "#181A1C", className: "bg-ink" },
      { name: "Tinta Lembut", hex: "#353A3E", className: "bg-ink-soft" },
      { name: "Tinta Redup", hex: "#545A61", className: "bg-ink-muted" },
      { name: "Tinta Tipis", hex: "#778089", className: "bg-ink-weak" },
    ],
  },
  {
    label: "Aksen / Status",
    swatches: [
      { name: "Sekunder", hex: "#0C2A2A", className: "bg-editorial" },
      {
        name: "Sekunder Dalam",
        hex: "#014847",
        className: "bg-editorial-deep",
      },
      { name: "Tautan", hex: "#2E51ED", className: "bg-link" },
      { name: "Peringatan", hex: "#F98E21", className: "bg-warn" },
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
      title="Sistem Warna"
      tagline="Token untuk masa depan yang lebih cerah dan mampu"
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
