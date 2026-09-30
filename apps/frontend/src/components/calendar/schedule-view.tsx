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
import { ItemKindIcon, ItemPreview, KIND_STYLES } from "./calendar-item";
import { isAllDayOn, itemTimeLabel, type ScheduleItem } from "./schedule-items";

export type ScheduleItemRowProps = {
  item: ScheduleItem;
  dayKey: DayKey;
  timeZone: string;
  done: boolean;
  /** A status change for this task is being saved. */
  pending: boolean;
  onEdit: () => void;
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
  onToggleDone,
}: ScheduleItemRowProps) {
  const style = KIND_STYLES[item.kind];
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
      className="flex min-h-11 items-center gap-3 rounded-sm px-2 hover:bg-surface-1/60"
    >
      <span className="grid size-5 shrink-0 place-items-center">
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
        className="flex min-w-0 flex-1 flex-col gap-x-4 rounded-sm py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 sm:flex-row sm:items-center"
      >
        <span
          className={cn(
            "shrink-0 font-mono text-xs text-ink-soft sm:w-28",
            done && "line-through decoration-ink/30"
          )}
        >
          {time}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-[15px] font-medium text-ink sm:flex-1",
            done && "text-ink-muted line-through decoration-ink/30"
          )}
        >
          {item.title}
        </span>
        {meta ? (
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-ink-muted sm:ml-auto sm:max-w-56">
            {item.kind === "event" ? (
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            ) : null}
            <span className="truncate">{meta}</span>
          </span>
        ) : null}
        <span
          className={cn(
            "w-fit shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold",
            style.badgeClass
          )}
        >
          {style.label}
        </span>
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
    <ol className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-canvas shadow-card lg:max-h-full lg:overflow-y-auto">
      {busyDays.map((key) => {
        const isToday = key === todayKey;
        const headingId = `schedule-day-${key}`;

        return (
          <li
            key={key}
            aria-labelledby={headingId}
            className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:gap-4 sm:px-4"
          >
            <h3 id={headingId} className="shrink-0 sm:w-32 sm:pt-1.5">
              <button
                type="button"
                aria-label={`Buka ${formatDayKeyLabel(key)}${isToday ? ", hari ini" : ""}`}
                aria-current={isToday ? "date" : undefined}
                className="flex items-center gap-2.5 rounded-sm px-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-brand/50"
                onClick={() => onOpenDay(key)}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-pill font-display text-lg font-semibold tabular-nums",
                    isToday && "bg-brand text-ink"
                  )}
                >
                  {parseDayKey(key).day}
                </span>
                <span className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">
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
