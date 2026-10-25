import { CalendarDays } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";
import type { ChatEntity } from "./chat-entities";
import {
  ENTITY_PILL_BASE_CLASS_NAME,
  ENTITY_PILL_STYLES,
} from "./entity-pill-styles";
import { EntitySnapshotDetails } from "./entity-snapshot-details";
import { EntityDetails } from "./entity-details";
import { useChatNotes } from "./chat-notes";

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
  const style = ENTITY_PILL_STYLES[entity.kind];
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
          ENTITY_PILL_BASE_CLASS_NAME,
          "mx-0.5 cursor-pointer align-baseline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
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
          ENTITY_PILL_BASE_CLASS_NAME,
          "mx-0.5 cursor-pointer align-baseline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
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
