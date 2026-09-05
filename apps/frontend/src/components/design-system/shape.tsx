import { ShowcaseSection } from "./section";

const RADII: { name: string; px: number; className: string }[] = [
  { name: "none", px: 0, className: "rounded-none" },
  { name: "xs", px: 2, className: "rounded-xs" },
  { name: "sm", px: 4, className: "rounded-sm" },
  { name: "md", px: 6, className: "rounded-md" },
  { name: "lg", px: 8, className: "rounded-lg" },
  { name: "xl", px: 12, className: "rounded-xl" },
  { name: "2xl", px: 16, className: "rounded-2xl" },
  { name: "pill", px: 360, className: "rounded-pill" },
];

const NOTES: { title: string; body: string }[] = [
  { title: "Batas", body: "Batas garis tipis 1px menggunakan #D1D5DA." },
  {
    title: "Elevasi",
    body: "Sebagian besar permukaan datar. Gunakan peningkatan tonal, bukan bayangan.",
  },
  { title: "Permukaan", body: "Kartu gelap editorial di atas kanvas terang." },
];

function ShapeSection() {
  return (
    <ShowcaseSection
      number="04"
      title="Bentuk"
      tagline="Detail halus. Kesan yang bertahan lama."
    >
      <h3 className="mb-4 font-mono text-xs leading-[18px] text-ink-soft uppercase">
        Radius batas (px)
      </h3>
      <ul className="mb-8 flex flex-wrap items-end gap-6">
        {RADII.map((radius) => (
          <li key={radius.name} className="flex flex-col items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-14 border border-hairline bg-surface-1/60 ${radius.className}`}
            />
            <span className="font-sans text-sm leading-[21px] text-ink">
              {radius.name}
            </span>
            <span className="font-sans text-xs text-ink-weak">{radius.px}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 rounded-md bg-surface-1/50 p-4 sm:grid-cols-3">
        {NOTES.map((note) => (
          <div key={note.title}>
            <h4 className="font-mono text-xs leading-[18px] text-ink uppercase">
              {note.title}
            </h4>
            <p className="font-sans text-sm leading-[21px] text-ink-muted">
              {note.body}
            </p>
          </div>
        ))}
      </div>
    </ShowcaseSection>
  );
}

export { ShapeSection };
