import type { ComponentType, CSSProperties } from "react";
import {
  BellGlyph,
  CalendarGlyph,
  MemoryGlyph,
  ReceiptGlyph,
  type GlyphHue,
  type GlyphProps,
} from "@/components/ui/glyphs";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";

type Starter = {
  id: string;
  icon: ComponentType<GlyphProps>;
  hue: GlyphHue;
  label: Record<SupportedLocale, string>;
  /** Draft placed in the message box; the user finishes or sends it. */
  draft: Record<SupportedLocale, string>;
};

// Everyday household examples a brand-new account can use. Each one creates or
// saves something, so none of them depends on data the user does not have yet.
const STARTERS: Starter[] = [
  {
    id: "bill",
    icon: BellGlyph,
    hue: "amber",
    label: { id: "Ingetin tagihan", en: "Bill reminder" },
    draft: {
      id: "Ingetin aku bayar listrik tiap tanggal ",
      en: "Remind me to pay the electricity bill every month on the ",
    },
  },
  {
    id: "important-info",
    icon: MemoryGlyph,
    hue: "violet",
    label: { id: "Simpan info penting", en: "Save important info" },
    draft: {
      id: "Simpan ya, nomor pelanggan listrik rumah: ",
      en: "Save this: our home electricity customer number is ",
    },
  },
  {
    id: "expense",
    icon: ReceiptGlyph,
    hue: "coral",
    label: { id: "Catat pengeluaran", en: "Log an expense" },
    draft: {
      id: "Catat pengeluaran hari ini: ",
      en: "Log today's expense: ",
    },
  },
  {
    id: "school-pickup",
    icon: CalendarGlyph,
    hue: "amber",
    label: { id: "Jemput anak", en: "School pickup" },
    draft: {
      id: "Ingetin aku jemput anak jam ",
      en: "Remind me to pick up the kids at ",
    },
  },
];

type ChatStartersProps = {
  locale: SupportedLocale;
  /** Hidden (but still occupying its space) once the user has a draft. */
  hidden: boolean;
  disabled?: boolean;
  onPick: (draft: string) => void;
};

export function ChatStarters({
  locale,
  hidden,
  disabled,
  onPick,
}: ChatStartersProps) {
  return (
    <ul
      aria-label={locale === "en" ? "Message starters" : "Contoh pesan"}
      className={cn(
        "flex flex-wrap justify-center gap-2 transition-opacity duration-200",
        hidden && "invisible opacity-0"
      )}
    >
      {STARTERS.map((starter, index) => {
        const Icon = starter.icon;

        return (
          <li
            key={starter.id}
            className="rise-in"
            style={{ "--i": index + 3 } as CSSProperties}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(starter.draft[locale])}
              className="glyph-host inline-flex min-h-10 items-center gap-2 rounded-full border border-hairline bg-canvas px-3.5 text-sm font-medium text-ink-soft outline-none transition-[translate,box-shadow,color,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-ink/16 hover:text-ink hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon hue={starter.hue} className="size-[18px]" />
              {starter.label[locale]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
