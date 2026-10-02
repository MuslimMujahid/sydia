import { MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils/cn";
import {
  formatDayKeyLabel,
  formatMonthShort,
  formatWeekdayShort,
  parseDayKey,
  type DayKey,
} from "./calendar-date";
import { ItemKindIcon, ItemPreview } from "./calendar-item";
import { isAllDayOn, itemTimeLabel, type ScheduleItem } from "./schedule-items";

export type ScheduleItemRowProps = {
  item: ScheduleItem;
  dayKey: DayKey;
  timeZone: string;
  done: boolean;
  /** A status change for this task is being saved. */
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: (done: boolean) => void;
};

/**
 * One item in the flat schedule list. The row opens the item's popover; tasks
 * can also be checked off in place.
 */
export function ScheduleItemRow({
  item,
  dayKey,
  timeZone,
  done,
  pending,
  onEdit,
  onDelete,
  onToggleDone,
}: ScheduleItemRowProps) {
  const time = isAllDayOn(item, dayKey, timeZone)
    ? "Sepanjang hari"
    : itemTimeLabel(item, timeZone);

  const meta =
    item.kind === "event"
      ? item.event.location
      : item.task.categories.map((category) => category.name).join(", ");

  return (
    <li
      aria-busy={pending || undefined}
      className="flex min-h-9 items-start gap-3 rounded-sm px-2 hover:bg-surface-1/60 sm:items-center"
    >
      {/* On mobile the text stacks, so pin the icon to the title's first line. */}
      <span className="mt-1.5 grid size-5 shrink-0 place-items-center sm:mt-0">
        {item.kind === "task" ? (
          <Checkbox
            checked={done}
            disabled={pending}
            aria-label={
              done
                ? `Tandai “${item.title}” belum selesai`
                : `Tandai “${item.title}” selesai`
            }
            // Amber like every other task, so the checkbox doubles as its icon.
            className="relative size-4 border-amber-500 after:absolute after:-inset-3 hover:border-amber-600 data-[checked]:border-amber-500 data-[checked]:bg-amber-500"
            onCheckedChange={(checked) => onToggleDone(checked)}
          />
        ) : (
          <ItemKindIcon kind="event" className="size-4" />
        )}
      </span>
      <ItemPreview
        item={item}
        timeZone={timeZone}
        done={done}
        onEdit={onEdit}
        onDelete={onDelete}
        className="flex min-w-0 flex-1 flex-col gap-x-4 rounded-sm py-1.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 sm:flex-row sm:items-center"
      >
        {/* Mobile reads title first with time beneath; desktop keeps a time column. */}
        <span
          className={cn(
            "order-2 shrink-0 font-mono text-xs leading-4 text-ink-soft sm:order-none sm:w-28",
            done && "line-through decoration-ink/30"
          )}
        >
          {time}
        </span>
        <span
          className={cn(
            "order-1 min-w-0 truncate text-sm leading-5 font-medium text-ink sm:order-none sm:flex-1",
            done && "text-ink-muted line-through decoration-ink/30"
          )}
        >
          {item.title}
        </span>
        {meta ? (
          <span className="order-3 flex min-w-0 items-center gap-1 truncate text-xs leading-4 text-ink-muted sm:order-none sm:ml-auto sm:max-w-56">
            {item.kind === "event" ? (
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            ) : null}
            <span className="truncate">{meta}</span>
          </span>
        ) : null}
      </ItemPreview>
    </li>
  );
}

export type ScheduleViewProps = {
  days: DayKey[];
  todayKey: DayKey;
  timeZone: string;
  itemsByDay: Record<DayKey, ScheduleItem[]>;
  isDone: (item: ScheduleItem) => boolean;
  isPending: (item: ScheduleItem) => boolean;
  onOpenDay: (dayKey: DayKey) => void;
  onEditItem: (item: ScheduleItem) => void;
  onDeleteItem: (item: ScheduleItem) => void;
  onToggleDone: (item: ScheduleItem, done: boolean) => void;
};

/** "Jadwal": every scheduled item in the range as one flat list by day. */
export function ScheduleView({
  days,
  todayKey,
  timeZone,
  itemsByDay,
  isDone,
  isPending,
  onOpenDay,
  onEditItem,
  onDeleteItem,
  onToggleDone,
}: ScheduleViewProps) {
  const busyDays = days.filter((key) => itemsByDay[key]?.length);

  if (!busyDays.length)
    return (
      <div className="rounded-lg border border-dashed border-ink/12 px-6 py-12 text-center">
        <p className="font-display text-base font-semibold text-ink">
          Tidak ada jadwal
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
          Belum ada acara atau tugas bertenggat dalam rentang ini.
        </p>
      </div>
    );

  return (
    <ol className="divide-y divide-hairline overflow-hidden rounded-lg bg-canvas lg:max-h-full lg:overflow-y-auto">
      {busyDays.map((key) => {
        const isToday = key === todayKey;
        const headingId = `schedule-day-${key}`;

        return (
          <li
            key={key}
            aria-labelledby={headingId}
            className="flex gap-2 py-1.5 pr-2 pl-3 sm:gap-4 sm:px-4"
          >
            <h3 id={headingId} className="w-14 shrink-0 pt-1 sm:w-32">
              <button
                type="button"
                aria-label={`Buka ${formatDayKeyLabel(key)}${isToday ? ", hari ini" : ""}`}
                aria-current={isToday ? "date" : undefined}
                className="flex w-full flex-col items-center gap-0.5 rounded-sm text-center outline-none focus-visible:outline-2 focus-visible:outline-brand/50 sm:w-auto sm:flex-row sm:gap-2.5 sm:px-2 sm:text-left"
                onClick={() => onOpenDay(key)}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-pill font-display text-sm font-semibold tabular-nums sm:size-7 sm:text-base",
                    isToday && "bg-brand text-ink"
                  )}
                >
                  {parseDayKey(key).day}
                </span>
                {/* "OKT, JUM" on one line: under the number on mobile, beside it on desktop. */}
                <span className="font-mono text-[10px] leading-tight whitespace-nowrap text-ink-muted uppercase sm:text-[11px] sm:tracking-wider">
                  {formatMonthShort(key)}, {formatWeekdayShort(key)}
                </span>
              </button>
            </h3>
            <ul className="min-w-0 flex-1">
              {(itemsByDay[key] ?? []).map((item) => (
                <ScheduleItemRow
                  key={item.key}
                  item={item}
                  dayKey={key}
                  timeZone={timeZone}
                  done={isDone(item)}
                  pending={isPending(item)}
                  onEdit={() => onEditItem(item)}
                  onDelete={() => onDeleteItem(item)}
                  onToggleDone={(done) => onToggleDone(item, done)}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
