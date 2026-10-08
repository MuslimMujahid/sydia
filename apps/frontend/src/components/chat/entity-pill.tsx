import { AlarmClock, CalendarDays, CheckSquare2, FileText } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";
import type { ChatEntity } from "./chat-entities";
import { EntityDetails } from "./entity-details";

const ENTITY_STYLES = {
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
}

export function EntityPill({
  entity,
  label = entity.title,
  locale,
  timezone,
}: EntityPillProps) {
  const [open, setOpen] = useState(false);
  const style = ENTITY_STYLES[entity.kind];
  const Icon = style.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-entity-kind={entity.kind}
        aria-label={`${style[locale]}: ${label}`}
        className={cn(
          "mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 align-baseline text-[0.875em] leading-6 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          style.color
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words whitespace-normal text-left [overflow-wrap:anywhere]">
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent>
        {open ? (
          <EntityDetails entity={entity} locale={locale} timezone={timezone} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
