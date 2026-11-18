import { useQuery } from "@tanstack/react-query";
import type { ComponentType, CSSProperties } from "react";
import {
  BellGlyph,
  CalendarGlyph,
  ContactGlyph,
  MemoryGlyph,
  NoteGlyph,
  ReceiptGlyph,
  TaskListGlyph,
  type GlyphHue,
  type GlyphProps,
} from "@/components/ui/glyphs";
import {
  exampleGroup,
  type ExampleGroup,
} from "@/lib/personalization/examples";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/preferences.queries";
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

/** One starter in the viewer's language. */
type LocalStarter = {
  id: string;
  icon: ComponentType<GlyphProps>;
  hue: GlyphHue;
  label: string;
  draft: string;
};

/**
 * Indonesian starters for the other example sets, matched to how the user
 * described themselves in onboarding. English keeps the household set.
 */
const GROUP_STARTERS: Record<
  Exclude<ExampleGroup, "household">,
  LocalStarter[]
> = {
  school: [
    {
      id: "homework",
      icon: BellGlyph,
      hue: "amber",
      label: "Ingetin PR",
      draft: "Ingetin aku kumpulin PR ",
    },
    {
      id: "exam",
      icon: CalendarGlyph,
      hue: "amber",
      label: "Jadwal ujian",
      draft: "Masukin ke kalender, ujian ",
    },
    {
      id: "lesson",
      icon: NoteGlyph,
      hue: "violet",
      label: "Catat materi",
      draft: "Catat materi hari ini: ",
    },
    {
      id: "allowance",
      icon: ReceiptGlyph,
      hue: "coral",
      label: "Catat uang jajan",
      draft: "Catat pengeluaran hari ini: ",
    },
  ],
  campus: [
    {
      id: "deadline",
      icon: BellGlyph,
      hue: "amber",
      label: "Ingetin deadline",
      draft: "Ingetin aku submit tugas ",
    },
    {
      id: "thesis",
      icon: TaskListGlyph,
      hue: "violet",
      label: "Tugas kuliah",
      draft: "Tambahin tugas ",
    },
    {
      id: "class",
      icon: CalendarGlyph,
      hue: "amber",
      label: "Jadwal kuliah",
      draft: "Masukin ke kalender, kuliah ",
    },
    {
      id: "boarding",
      icon: ReceiptGlyph,
      hue: "coral",
      label: "Catat pengeluaran",
      draft: "Catat pengeluaran hari ini: ",
    },
  ],
  work: [
    {
      id: "meeting",
      icon: CalendarGlyph,
      hue: "amber",
      label: "Jadwal meeting",
      draft: "Masukin ke kalender, meeting ",
    },
    {
      id: "deadline",
      icon: BellGlyph,
      hue: "amber",
      label: "Ingetin deadline",
      draft: "Ingetin aku kirim ",
    },
    {
      id: "minutes",
      icon: NoteGlyph,
      hue: "violet",
      label: "Catat poin meeting",
      draft: "Catat poin meeting hari ini: ",
    },
    {
      id: "reimburse",
      icon: ReceiptGlyph,
      hue: "coral",
      label: "Catat reimburse",
      draft: "Catat pengeluaran kantor: ",
    },
  ],
  business: [
    {
      id: "order",
      icon: NoteGlyph,
      hue: "violet",
      label: "Catat pesanan",
      draft: "Catat pesanan: ",
    },
    {
      id: "restock",
      icon: BellGlyph,
      hue: "amber",
      label: "Ingetin belanja stok",
      draft: "Ingetin aku belanja stok ",
    },
    {
      id: "expense",
      icon: ReceiptGlyph,
      hue: "coral",
      label: "Catat pengeluaran",
      draft: "Catat pengeluaran usaha hari ini: ",
    },
    {
      id: "customer",
      icon: ContactGlyph,
      hue: "violet",
      label: "Simpan pelanggan",
      draft: "Simpan nomor pelanggan: ",
    },
  ],
};

function startersFor(
  locale: SupportedLocale,
  group: ExampleGroup
): LocalStarter[] {
  if (locale === "id" && group !== "household") return GROUP_STARTERS[group];

  return STARTERS.map((starter) => ({
    ...starter,
    label: starter.label[locale],
    draft: starter.draft[locale],
  }));
}

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
  // Until preferences load, or if they fail, the household set shows.
  const preferences = useQuery(userPreferencesQueryOptions());
  const starters = startersFor(
    locale,
    exampleGroup(preferences.data?.occupation)
  );

  return (
    <ul
      aria-label={locale === "en" ? "Message starters" : "Contoh pesan"}
      className={cn(
        "flex flex-wrap justify-center gap-2 transition-opacity duration-200",
        hidden && "invisible opacity-0"
      )}
    >
      {starters.map((starter, index) => {
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
              onClick={() => onPick(starter.draft)}
              className="glyph-host inline-flex min-h-10 items-center gap-2 rounded-full border border-hairline bg-canvas px-3.5 text-sm font-medium text-ink-soft outline-none transition-[translate,box-shadow,color,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-ink/16 hover:text-ink hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon hue={starter.hue} className="size-[18px]" />
              {starter.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
