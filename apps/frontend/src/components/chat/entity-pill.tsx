import {
  AlarmClock,
  CalendarDays,
  CheckSquare2,
  FileText,
  Files,
} from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";
import type { ChatEntity } from "./chat-entities";
import { EntitySnapshotDetails } from "./entity-snapshot-details";
import { EntityDetails } from "./entity-details";
import { useChatNotes } from "./chat-notes";

const ENTITY_STYLES = {
  note: {
    icon: Files,
    color: "bg-brand/8 text-ink hover:bg-brand/15",
    en: "Note",
    id: "Catatan",
  },
  task: {
    icon: CheckSquare2,
    color: "bg-blue-50 text-blue-800 hover:bg-blue-100",
    en: "Task",
    id: "Tugas",
  },
  reminder: {
    icon: AlarmClock,
    color: "bg-amber-50 text-amber-900 hover:bg-amber-100",
    en: "Reminder",
    id: "Pengingat",
  },
  file: {
    icon: FileText,
    color: "bg-violet-50 text-violet-800 hover:bg-violet-100",
    en: "File",
    id: "File",
  },
  event: {
    icon: CalendarDays,
    color: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    en: "Event",
    id: "Acara",
  },
};

interface EntityPillProps {
  entity: ChatEntity;
  label?: string;
  locale: SupportedLocale;
  timezone: string;
  snapshotOnly?: boolean;
}

export function EntityPill({
  entity,
  label = entity.title,
  locale,
  timezone,
  snapshotOnly = false,
}: EntityPillProps) {
  const [open, setOpen] = useState(false);
  const notes = useChatNotes();
  const style = ENTITY_STYLES[entity.kind];
  const Icon =
    entity.kind === "note" && entity.ref.startsWith("daily:")
      ? CalendarDays
      : style.icon;

  const displayLabel =
    entity.kind === "note" && entity.ref.startsWith("daily:")
      ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${entity.ref.slice(6)}T12:00:00Z`))
      : label;

  if (entity.kind === "note" && !snapshotOnly)
    return (
      <button
        type="button"
        data-entity-kind="note"
        aria-label={`${style[locale]}: ${displayLabel}`}
        disabled={!notes}
        className={cn(
          "mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 align-baseline text-[0.875em] leading-6 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          style.color
        )}
        onClick={(event) => notes?.open(entity.ref, event.currentTarget)}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words whitespace-normal text-left [overflow-wrap:anywhere]">
          {displayLabel}
        </span>
      </button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-entity-kind={entity.kind}
        aria-label={`${style[locale]}: ${displayLabel}`}
        className={cn(
          "mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 align-baseline text-[0.875em] leading-6 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          style.color
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words whitespace-normal text-left [overflow-wrap:anywhere]">
          {displayLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent>
        {open ? (
          snapshotOnly ? (
            <EntitySnapshotDetails
              entity={entity}
              locale={locale}
              timezone={timezone}
            />
          ) : (
            <EntityDetails
              entity={entity}
              locale={locale}
              timezone={timezone}
            />
          )
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
