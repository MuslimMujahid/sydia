import {
  AlignLeft,
  CalendarDays,
  Clock3,
  Flag,
  MapPin,
  Pencil,
  SquareCheck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { CategoryIcon } from "@/components/tasks/category-icon";
import {
  PRIORITY_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
} from "@/components/tasks/task-view";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import { cn } from "@/lib/utils/cn";
import {
  itemRangeLabel,
  itemStartTimeLabel,
  itemTimeLabel,
  itemWhenLabel,
  type ScheduleItem,
  type ScheduleItemKind,
} from "./schedule-items";

/**
 * Events and tasks are told apart by color and icon: events are violet with a
 * calendar, tasks are amber with a checkbox. Both hues come from the aurora
 * gradient's stops. Every item also carries its kind in its accessible name.
 */
type KindStyle = {
  label: string;
  icon: LucideIcon;
  /** Icon color on light surfaces. */
  iconClass: string;
  /** Small solid marker, such as the dots on phone and year grids. */
  dotClass: string;
  /** Solid fill and text of every calendar card. */
  cardClass: string;
  /** Kind badge in the detail popover. */
  badgeClass: string;
};

export const KIND_STYLES: Record<ScheduleItemKind, KindStyle> = {
  event: {
    label: "Acara",
    icon: CalendarDays,
    iconClass: "text-violet-600",
    dotClass: "bg-violet-500",
    // White on violet-600 keeps small card text readable (AA).
    cardClass: "bg-violet-600 text-white hover:bg-violet-700",
    badgeClass: "bg-violet-100 text-violet-700",
  },
  task: {
    label: "Tugas",
    icon: SquareCheck,
    iconClass: "text-amber-600",
    dotClass: "bg-amber-500",
    // White on amber is too faint, so amber cards use dark text.
    cardClass: "bg-amber-400 text-amber-950 hover:bg-amber-500",
    badgeClass: "bg-amber-100 text-amber-800",
  },
};

type ItemKindIconProps = { kind: ScheduleItemKind; className?: string };

export function ItemKindIcon({ kind, className }: ItemKindIconProps) {
  const style = KIND_STYLES[kind];
  const Icon = style.icon;

  return (
    <Icon
      aria-hidden="true"
      strokeWidth={2.25}
      className={cn("size-3.5 shrink-0", style.iconClass, className)}
    />
  );
}

/** "Acara: Rapat, 09.00–10.00" or "Tugas: Kirim laporan, tenggat 10.00, selesai". */
export function itemAccessibleLabel(
  item: ScheduleItem,
  timeZone: string,
  done = false
): string {
  const time = itemTimeLabel(item, timeZone);

  return item.kind === "event"
    ? `Acara: ${item.title}, ${time}`
    : `Tugas: ${item.title}, tenggat ${time}${done ? ", selesai" : ""}`;
}

const DONE_TITLE_CLASS = "line-through decoration-current/40";

type DetailRowProps = { icon: LucideIcon; children: ReactNode };

function DetailRow({ icon: Icon, children }: DetailRowProps) {
  return (
    <li className="flex gap-3">
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-ink-muted"
      />
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
    </li>
  );
}

type ItemDetailsProps = {
  item: ScheduleItem;
  timeZone: string;
  done: boolean;
};

/** Read-only facts about an item, shown in its popover. */
function ItemDetails({ item, timeZone, done }: ItemDetailsProps) {
  const when = (
    <DetailRow icon={Clock3}>{itemWhenLabel(item, timeZone)}</DetailRow>
  );

  if (item.kind === "event") {
    const { event } = item;

    return (
      <ul className="mt-4 space-y-3">
        {when}
        {event.location ? (
          <DetailRow icon={MapPin}>{event.location}</DetailRow>
        ) : null}
        {event.attendees.length ? (
          <DetailRow icon={UsersRound}>
            <p className="text-ink-muted">{event.attendees.length} peserta</p>
            <p className="break-words">{event.attendees.join(", ")}</p>
          </DetailRow>
        ) : null}
        {event.description ? (
          <DetailRow icon={AlignLeft}>
            <p className="line-clamp-6 whitespace-pre-line">
              {event.description}
            </p>
          </DetailRow>
        ) : null}
        <DetailRow icon={CalendarDays}>
          <span className="text-ink-muted">
            {event.provider === "google" ? "Google Calendar" : "Sydia"}
          </span>
        </DetailRow>
      </ul>
    );
  }

  const { task } = item;
  // Follow a check-off that is still being saved.
  const status: TaskStatus = done
    ? "done"
    : task.status === "done"
      ? "inbox"
      : task.status;

  const StatusIcon = STATUS_ICONS[status];

  return (
    <ul className="mt-4 space-y-3">
      {when}
      <DetailRow icon={StatusIcon}>{STATUS_LABELS[status]}</DetailRow>
      <DetailRow icon={Flag}>
        Prioritas {PRIORITY_LABELS[task.priority].toLowerCase()}
      </DetailRow>
      {task.categories.length ? (
        <li className="flex flex-wrap gap-1.5 pl-7">
          {task.categories.map((category) => (
            <span
              key={category.id}
              className="inline-flex items-center gap-1 rounded-pill bg-surface-1 py-0.5 pr-2 pl-0.5 text-xs font-medium text-ink-soft"
            >
              <CategoryIcon
                iconKey={category.iconKey}
                color={category.color}
                className="size-4.5 rounded-pill [&_svg]:size-3"
              />
              {category.name}
            </span>
          ))}
        </li>
      ) : null}
      {task.description ? (
        <DetailRow icon={AlignLeft}>
          <p className="line-clamp-6 whitespace-pre-line">{task.description}</p>
        </DetailRow>
      ) : null}
    </ul>
  );
}

type ItemPreviewProps = {
  item: ScheduleItem;
  timeZone: string;
  done: boolean;
  /** Classes for the card that opens the popover. */
  className: string;
  /** Opens the item's edit dialog. */
  onEdit: () => void;
  children: ReactNode;
};

/**
 * A card (or list row) that opens a read-only popover anchored to itself.
 * Editing happens only from the popover's edit button.
 */
export function ItemPreview({
  item,
  timeZone,
  done,
  className,
  onEdit,
  children,
}: ItemPreviewProps) {
  const style = KIND_STYLES[item.kind];
  // Leaving for the edit dialog must not pull focus back to the card, or it
  // would fight the dialog's own focus handling.
  const editingRef = useRef(false);
  const editLabel = item.kind === "event" ? "Edit acara" : "Edit tugas";

  return (
    // Modal so a click outside only dismisses the popover and cannot also
    // start a new item on the grid underneath.
    <Popover
      modal
      onOpenChange={(open) => {
        if (open) editingRef.current = false;
      }}
    >
      <PopoverTrigger
        aria-label={itemAccessibleLabel(item, timeZone, done)}
        className={className}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        finalFocus={() => !editingRef.current}
      >
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs font-semibold",
              style.badgeClass
            )}
          >
            <ItemKindIcon kind={item.kind} className="text-current" />
            {style.label}
          </span>
          <PopoverClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto size-9"
                aria-label={editLabel}
                title={editLabel}
              />
            }
            onClick={() => {
              editingRef.current = true;
              onEdit();
            }}
          >
            <Pencil />
          </PopoverClose>
          <PopoverClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-2 size-9"
                aria-label="Tutup"
                title="Tutup"
              />
            }
          >
            <X />
          </PopoverClose>
        </div>
        <PopoverTitle
          className={cn("mt-3 break-words", done && DONE_TITLE_CLASS)}
        >
          {item.title}
        </PopoverTitle>
        <ItemDetails item={item} timeZone={timeZone} done={done} />
      </PopoverContent>
    </Popover>
  );
}

type ItemChipProps = {
  item: ScheduleItem;
  timeZone: string;
  done?: boolean;
  onEdit: () => void;
};

/** A one-line card in a month cell or the all-day strip. */
export function ItemChip({
  item,
  timeZone,
  done = false,
  onEdit,
}: ItemChipProps) {
  const style = KIND_STYLES[item.kind];

  return (
    <ItemPreview
      item={item}
      timeZone={timeZone}
      done={done}
      onEdit={onEdit}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-left text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-brand/50 data-[popup-open]:ring-2 data-[popup-open]:ring-ink/30",
        style.cardClass,
        done && "opacity-60"
      )}
    >
      <ItemKindIcon kind={item.kind} className="size-3 text-current" />
      <span className={cn("truncate", done && DONE_TITLE_CLASS)}>
        {item.title}
      </span>
    </ItemPreview>
  );
}

type ItemBlockProps = {
  item: ScheduleItem;
  timeZone: string;
  done?: boolean;
  /**
   * Blocks too short for two lines show "Title, 17.45" on one line; taller
   * blocks show the title with the start and end time below it.
   */
  compact: boolean;
  onEdit: () => void;
};

/** A positioned card in the day and week time grid. */
export function ItemBlock({
  item,
  timeZone,
  done = false,
  compact,
  onEdit,
}: ItemBlockProps) {
  const style = KIND_STYLES[item.kind];

  return (
    <ItemPreview
      item={item}
      timeZone={timeZone}
      done={done}
      onEdit={onEdit}
      className={cn(
        // The canvas-colored ring keeps cascading, overlapping cards apart.
        "flex size-full min-w-0 overflow-hidden rounded-sm px-1.5 text-left text-xs leading-4 ring-1 ring-canvas outline-none focus-visible:outline-2 focus-visible:outline-brand/50 data-[popup-open]:shadow-card",
        compact ? "items-center gap-1.5" : "flex-col py-1",
        style.cardClass,
        done && "opacity-60"
      )}
    >
      {compact ? (
        <>
          <ItemKindIcon kind={item.kind} className="size-3 text-current" />
          <span className="min-w-0 truncate">
            <span className={cn("font-semibold", done && DONE_TITLE_CLASS)}>
              {item.title}
            </span>
            , {itemStartTimeLabel(item, timeZone)}
          </span>
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-1.5">
            <ItemKindIcon kind={item.kind} className="size-3 text-current" />
            <span
              className={cn("truncate font-semibold", done && DONE_TITLE_CLASS)}
            >
              {item.title}
            </span>
          </span>
          <time className="truncate tabular-nums">
            {itemRangeLabel(item, timeZone)}
          </time>
        </>
      )}
    </ItemPreview>
  );
}

/** The key telling the two kinds apart. */
export function CalendarLegend({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-xs font-medium text-ink-muted",
        className
      )}
    >
      {(["event", "task"] as const).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <ItemKindIcon kind={kind} /> {KIND_STYLES[kind].label}
        </span>
      ))}
    </p>
  );
}
