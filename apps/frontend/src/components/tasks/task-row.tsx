import {
  CalendarClock,
  Flag,
  MoreHorizontal,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Task, TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import { formatRelativeDay } from "@/lib/utils/date-time";
import { cn } from "@/lib/utils/cn";
import { CategoryIcon } from "./category-icon";
import {
  PRIORITY_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  isTaskOverdue,
  isTaskStatus,
} from "./task-view";

const VISIBLE_CATEGORY_LIMIT = 2;

// Fits the common short labels ("besok", "kemarin", "hari ini"). It is a
// minimum, so a longer label grows toward the title and never away from the
// actions menu, which keeps the dates close to it.
const DUE_COLUMN_CLASS = "sm:min-w-20 sm:shrink-0 sm:justify-start";

/**
 * The single surface that holds every status section of the task list. Rows
 * sit directly on it and only gain a background on hover.
 */
export const TASK_LIST_CARD_CLASS =
  "rounded-lg border border-ink/5 bg-canvas shadow-[0_1px_2px_rgba(23,20,25,0.03)]";

export type TaskRowProps = {
  task: Task;
  now: Date;
  /** The status being saved for this task, shown optimistically. */
  pendingStatus?: TaskStatus;
  onOpen: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
};

export function TaskRow({
  task,
  now,
  pendingStatus,
  onOpen,
  onStatusChange,
  onDelete,
}: TaskRowProps) {
  const status = pendingStatus ?? task.status;
  const pending = pendingStatus !== undefined;
  const done = status === "done";
  const finished = done || status === "cancelled";
  const overdue = isTaskOverdue({ ...task, status }, now);
  const visibleCategories = task.categories.slice(0, VISIBLE_CATEGORY_LIMIT);
  const hiddenCategoryCount = task.categories.length - visibleCategories.length;
  const priorityLabel = `Prioritas ${PRIORITY_LABELS[task.priority].toLowerCase()}`;

  return (
    <li
      aria-busy={pending || undefined}
      className="relative flex items-start gap-3 rounded-md py-1.5 pr-1 pl-2 transition-colors hover:bg-surface-1 sm:items-center sm:gap-4 sm:py-0"
    >
      {status === "doing" ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.75 rounded-full bg-brand"
        />
      ) : null}
      {/* The pseudo-element widens the tap target to ~44px on touch screens. */}
      <Checkbox
        checked={done}
        disabled={pending}
        aria-label={
          done
            ? `Tandai “${task.title}” belum selesai`
            : `Tandai “${task.title}” selesai`
        }
        className="relative mt-0.5 size-5 rounded-md after:absolute after:-inset-3 sm:mt-0"
        onCheckedChange={(checked) =>
          onStatusChange(checked ? "done" : "inbox")
        }
      />
      <Flag
        aria-hidden="true"
        className={cn(
          "mt-1 size-4 shrink-0 text-ink/15 sm:mt-0",
          task.priority === "medium" && "text-ink-muted/60",
          task.priority === "high" && "fill-brand text-brand",
          finished && "opacity-50"
        )}
      />
      <button
        type="button"
        className="min-w-0 flex-1 rounded-sm py-0.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 sm:flex sm:min-h-8 sm:items-center sm:gap-4 sm:py-0"
        onClick={onOpen}
      >
        <span
          className={cn(
            "line-clamp-2 text-[15px] leading-snug font-medium text-ink sm:line-clamp-1 sm:flex-1",
            finished && "text-ink-muted line-through decoration-ink/30"
          )}
        >
          {task.title}
          <span className="sr-only">, {priorityLabel.toLowerCase()}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted sm:mt-0 sm:shrink-0 sm:flex-nowrap sm:justify-end">
          {status === "doing" || status === "cancelled" ? (
            <Badge
              dot={status === "doing" ? "brand" : "destructive"}
              className="px-2 py-0.5 text-xs"
            >
              {STATUS_LABELS[status]}
            </Badge>
          ) : null}
          {visibleCategories.map((category) => (
            <span
              key={category.id}
              className="inline-flex max-w-32 items-center gap-1 rounded-pill bg-surface-1 py-0.5 pr-2 pl-0.5 font-medium text-ink-soft"
            >
              <CategoryIcon
                iconKey={category.iconKey}
                color={category.color}
                className="size-4.5 shrink-0 rounded-pill [&_svg]:size-3"
              />
              <span className="truncate">{category.name}</span>
            </span>
          ))}
          {hiddenCategoryCount > 0 ? (
            <span
              className="rounded-pill bg-surface-1 px-2 py-0.5 font-medium text-ink-soft"
              title={task.categories
                .slice(VISIBLE_CATEGORY_LIMIT)
                .map((category) => category.name)
                .join(", ")}
            >
              +{hiddenCategoryCount}
              <span className="sr-only"> kategori lainnya</span>
            </span>
          ) : null}
          {/* A fixed, left-aligned column keeps every due date icon on the
              same vertical line, whatever the text length. Rows without a
              due date keep the column empty so the chips stay aligned. */}
          {task.dueAt ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap",
                DUE_COLUMN_CLASS,
                overdue && "font-semibold text-destructive"
              )}
            >
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only">Tenggat </span>
              {formatRelativeDay(task.dueAt, now)}
              {overdue ? <span className="sr-only"> (terlambat)</span> : null}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={cn("hidden sm:block", DUE_COLUMN_CLASS)}
            />
          )}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 max-sm:-my-2 max-sm:size-10 sm:-ml-2"
              aria-label={`Aksi untuk ${task.title}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={onOpen}>
            <PanelRightOpen /> Buka rincian
          </DropdownMenuItem>
          <div
            aria-hidden="true"
            className="mt-1 border-t border-hairline px-2.5 pt-2.5 pb-1 text-xs font-semibold text-ink-muted"
          >
            Status
          </div>
          <DropdownMenuRadioGroup
            aria-label="Status"
            value={status}
            onValueChange={(value: unknown) => {
              if (isTaskStatus(value) && value !== status)
                onStatusChange(value);
            }}
          >
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((value) => {
              const Icon = STATUS_ICONS[value];

              return (
                <DropdownMenuRadioItem
                  key={value}
                  value={value}
                  disabled={pending}
                >
                  <Icon /> {STATUS_LABELS[value]}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
          <div aria-hidden="true" className="my-1 border-t border-hairline" />
          <DropdownMenuItem destructive onClick={onDelete}>
            <Trash2 /> Hapus tugas
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

const SKELETON_WIDTHS = ["w-3/5", "w-2/5", "w-4/5", "w-1/2"];

export function TaskListSkeleton({ label }: { label: string }) {
  return (
    <ul
      className={cn(TASK_LIST_CARD_CLASS, "space-y-px p-2")}
      aria-busy="true"
      aria-label={label}
    >
      {SKELETON_WIDTHS.map((width) => (
        <li
          key={width}
          className="flex items-center gap-3 py-1.5 pr-3 pl-2 sm:min-h-8 sm:gap-4 sm:py-0"
        >
          <div className="size-5 shrink-0 animate-pulse rounded-md bg-surface-1 motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className={cn(
                "h-4 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none",
                width
              )}
            />
            <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none sm:hidden" />
          </div>
        </li>
      ))}
    </ul>
  );
}
