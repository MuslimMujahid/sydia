import {
  AlarmClockOff,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Check,
  ListTodo,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Category } from "@/lib/services/api/categories/categories.api";
import type { TaskDueFilter } from "@/lib/services/api/tasks/tasks.api";
import { cn } from "@/lib/utils/cn";
import { CategoryIcon } from "./category-icon";
import {
  DUE_LABELS,
  STATUS_ICONS,
  STATUS_FILTERS,
  STATUS_FILTER_LABELS,
  type TaskStatusFilter,
} from "./task-view";

const STATUS_FILTER_ICONS: Record<TaskStatusFilter, LucideIcon> = {
  all: ListTodo,
  ...STATUS_ICONS,
};

const DUE_FILTER_ICONS: Record<TaskDueFilter | "all", LucideIcon> = {
  all: CalendarDays,
  today: CalendarCheck,
  upcoming: CalendarClock,
  overdue: AlarmClockOff,
  none: CalendarX,
};

type FilterOptionProps = {
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
};

function FilterOption({
  icon,
  label,
  active,
  count,
  onClick,
}: FilterOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm text-ink-muted outline-none hover:bg-surface-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand/50 xl:min-h-10",
        active && "bg-brand/10 font-semibold text-ink hover:bg-brand/15"
      )}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-5 shrink-0 place-items-center [&_svg]:size-4",
          active && "text-brand"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span
          className={cn(
            "min-w-7 rounded-pill px-2 py-0.5 text-center font-mono text-xs tabular-nums",
            active ? "bg-brand text-canvas" : "bg-surface-1 text-ink-soft"
          )}
        >
          {count}
          <span className="sr-only"> tugas</span>
        </span>
      ) : null}
    </button>
  );
}

type FilterGroupProps = {
  legend: string;
  action?: ReactNode;
  children: ReactNode;
};

function FilterGroup({ legend, action, children }: FilterGroupProps) {
  const headingId = useId();

  return (
    <div role="group" aria-labelledby={headingId} className="min-w-0 space-y-1">
      <div className="flex min-h-9 items-center justify-between gap-2 px-3">
        <h2
          id={headingId}
          className="text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          {legend}
        </h2>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export type TaskFilterPanelProps = {
  status: TaskStatusFilter;
  counts?: Record<TaskStatusFilter, number>;
  due: TaskDueFilter | "all";
  categories: Category[];
  categoriesLoading: boolean;
  selectedCategoryIds: string[];
  /** The status group is hidden where the status chips already show it. */
  showStatus?: boolean;
  className?: string;
  onStatusChange: (status: TaskStatusFilter) => void;
  onDueChange: (due: TaskDueFilter | "all") => void;
  onCategoryToggle: (categoryId: string) => void;
  onManageCategories: () => void;
};

export function TaskFilterPanel({
  status,
  counts,
  due,
  categories,
  categoriesLoading,
  selectedCategoryIds,
  showStatus = true,
  className,
  onStatusChange,
  onDueChange,
  onCategoryToggle,
  onManageCategories,
}: TaskFilterPanelProps) {
  return (
    <div className={cn("space-y-5", className)}>
      {showStatus ? (
        <FilterGroup legend="Status">
          {STATUS_FILTERS.map((value) => {
            const Icon = STATUS_FILTER_ICONS[value];

            return (
              <FilterOption
                key={value}
                icon={<Icon />}
                label={STATUS_FILTER_LABELS[value]}
                count={counts?.[value]}
                active={status === value}
                onClick={() => onStatusChange(value)}
              />
            );
          })}
        </FilterGroup>
      ) : null}
      <FilterGroup legend="Tenggat">
        {(Object.keys(DUE_LABELS) as Array<TaskDueFilter | "all">).map(
          (value) => {
            const Icon = DUE_FILTER_ICONS[value];

            return (
              <FilterOption
                key={value}
                icon={<Icon />}
                label={DUE_LABELS[value]}
                active={due === value}
                onClick={() => onDueChange(value)}
              />
            );
          }
        )}
      </FilterGroup>
      <FilterGroup
        legend="Kategori"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-2 min-h-9 px-2.5 text-xs"
            onClick={onManageCategories}
          >
            <Pencil className="size-3.5" /> Kelola
          </Button>
        }
      >
        <div aria-busy={categoriesLoading} className="space-y-0.5">
          {categoriesLoading ? (
            <div className="space-y-2 px-3 py-1">
              {["w-3/4", "w-1/2"].map((width) => (
                <div
                  key={width}
                  className={cn(
                    "h-6 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none",
                    width
                  )}
                />
              ))}
            </div>
          ) : categories.length ? (
            categories.map((category) => {
              const active = selectedCategoryIds.includes(category.id);

              return (
                <FilterOption
                  key={category.id}
                  icon={
                    active ? (
                      <Check className="text-brand" />
                    ) : (
                      <CategoryIcon
                        iconKey={category.iconKey}
                        color={category.color}
                        className="size-5 rounded-md [&_svg]:size-3.5"
                      />
                    )
                  }
                  label={category.name}
                  count={category.taskCount}
                  active={active}
                  onClick={() => onCategoryToggle(category.id)}
                />
              );
            })
          ) : (
            <p className="px-3 py-2 text-sm text-ink-muted">
              Belum ada kategori.
            </p>
          )}
        </div>
      </FilterGroup>
    </div>
  );
}

export type TaskStatusChipsProps = {
  status: TaskStatusFilter;
  counts?: Record<TaskStatusFilter, number>;
  className?: string;
  onStatusChange: (status: TaskStatusFilter) => void;
};

/** A swipeable status switcher for screens without the filter sidebar. */
export function TaskStatusChips({
  status,
  counts,
  className,
  onStatusChange,
}: TaskStatusChipsProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">Filter status</legend>
      {/*
        `relative` makes this scroller the containing block for the chips'
        sr-only text; without it those absolutely positioned spans escape the
        overflow clip and widen the whole page on phones.
      */}
      <div className="relative -mx-5 flex snap-x gap-2 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:-mx-12 lg:scroll-px-12 lg:px-12 [&::-webkit-scrollbar]:hidden">
        {STATUS_FILTERS.map((value) => {
          const active = status === value;

          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-pill border border-ink/10 bg-canvas py-1 pr-1.5 pl-3.5 text-sm font-medium whitespace-nowrap text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50",
                active && "border-ink bg-ink text-canvas"
              )}
              onClick={() => onStatusChange(value)}
            >
              {STATUS_FILTER_LABELS[value]}
              {counts ? (
                <span
                  className={cn(
                    "min-w-7 rounded-pill px-1.5 py-0.5 text-center font-mono text-xs tabular-nums",
                    active
                      ? "bg-canvas/20 text-canvas"
                      : "bg-surface-1 text-ink-soft"
                  )}
                >
                  {counts[value]}
                  <span className="sr-only"> tugas</span>
                </span>
              ) : (
                <span aria-hidden="true" className="w-1.5" />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
