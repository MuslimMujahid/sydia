import type { ComponentType, CSSProperties } from "react";
import {
  BellGlyph,
  CalendarGlyph,
  NoteGlyph,
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

const STARTERS: Starter[] = [
  {
    id: "expense",
    icon: ReceiptGlyph,
    hue: "coral",
    label: { id: "Catat pengeluaran", en: "Log an expense" },
    draft: { id: "Catat pengeluaran saya: ", en: "Log my expense: " },
  },
  {
    id: "reminder",
    icon: BellGlyph,
    hue: "amber",
    label: { id: "Buat pengingat", en: "Set a reminder" },
    draft: { id: "Ingatkan saya untuk ", en: "Remind me to " },
  },
  {
    id: "agenda",
    icon: CalendarGlyph,
    hue: "amber",
    label: { id: "Agenda hari ini", en: "Today's agenda" },
    draft: {
      id: "Apa saja agenda saya hari ini?",
      en: "What is on my agenda today?",
    },
  },
  {
    id: "note",
    icon: NoteGlyph,
    hue: "violet",
    label: { id: "Tulis catatan", en: "Write a note" },
    draft: { id: "Buat catatan tentang ", en: "Create a note about " },
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
