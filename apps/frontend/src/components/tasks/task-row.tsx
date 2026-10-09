import {
  CalendarClock,
  ChevronDown,
  Flag,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
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
  countOverdueDays,
  isTaskOverdue,
  isTaskStatus,
} from "./task-view";

const VISIBLE_CATEGORY_LIMIT = 2;

// A fixed width, wide enough for the longest label ("30 Des 2026, 18.00" in
// semibold). The labels are left-aligned inside it, so every row's due date
// icon and text start on the same vertical line; a minimum width would let
// longer labels push their icon left of the others.
const DUE_COLUMN_CLASS = "sm:w-40 sm:shrink-0 sm:justify-start";

/**
 * The single surface that holds every status section of the task list. Rows
 * sit directly on it and only gain a background on hover. The padding keeps
 * the rows and section headings off the card edge on every side.
 */
export const TASK_LIST_CARD_CLASS =
  "rounded-lg border border-ink/5 bg-canvas p-1 shadow-[0_1px_2px_rgba(23,20,25,0.03)] sm:p-1.5";

type TaskDueProps = {
  dueAt: string;
  overdue: boolean;
  now: Date;
  className?: string;
};

function TaskDue({ dueAt, overdue, now, className }: TaskDueProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        overdue && "font-semibold text-destructive",
        className
      )}
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Tenggat </span>
      {formatRelativeDay(dueAt, now)}
      {overdue ? <span className="sr-only"> (terlambat)</span> : null}
    </span>
  );
}

type TaskCategoryChipsProps = {
  categories: Task["categories"];
  finished: boolean;
};

/** The first categories as chips, then a "+n" chip for the rest. */
function TaskCategoryChips({ categories, finished }: TaskCategoryChipsProps) {
  const visibleCategories = categories.slice(0, VISIBLE_CATEGORY_LIMIT);
  const hiddenCategoryCount = categories.length - visibleCategories.length;

  return (
    <>
      {visibleCategories.map((category) => (
        <span
          key={category.id}
          className={cn(
            "inline-flex max-w-32 items-center gap-1 rounded-pill bg-surface-1 py-0.5 pr-2 pl-0.5 font-medium text-ink-soft",
            finished && "text-ink/40"
          )}
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
          className={cn(
            "rounded-pill bg-surface-1 px-2 py-0.5 font-medium text-ink-soft",
            finished && "text-ink/40"
          )}
          title={categories
            .slice(VISIBLE_CATEGORY_LIMIT)
            .map((category) => category.name)
            .join(", ")}
        >
          +{hiddenCategoryCount}
          <span className="sr-only"> kategori lainnya</span>
        </span>
      ) : null}
    </>
  );
}

/** Only the in-progress and cancelled statuses get a badge. */
function TaskStatusBadge({ status }: { status: TaskStatus }) {
  if (status !== "doing" && status !== "cancelled") return null;

  return (
    <Badge
      dot={status === "doing" ? "brand" : "destructive"}
      className="px-2 py-0.5 text-xs"
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

type TaskMetaProps = {
  task: Task;
  status: TaskStatus;
  finished: boolean;
  overdue: boolean;
  now: Date;
};

/** From `sm`: status badge, categories, and due date inline in the row. */
function TaskMeta({ task, status, finished, overdue, now }: TaskMetaProps) {
  return (
    <span
      className={cn(
        "hidden items-center gap-x-3 text-xs text-ink-muted sm:flex sm:shrink-0 sm:justify-end",
        finished && "text-ink/40"
      )}
    >
      <TaskStatusBadge status={status} />
      <TaskCategoryChips categories={task.categories} finished={finished} />
      {/* A fixed, left-aligned column keeps every due date icon on the same
          vertical line, whatever the text length. Rows without a due date
          keep the column empty so the chips stay aligned. */}
      {task.dueAt ? (
        <TaskDue
          dueAt={task.dueAt}
          overdue={overdue}
          now={now}
          className={DUE_COLUMN_CLASS}
        />
      ) : (
        <span aria-hidden="true" className={DUE_COLUMN_CLASS} />
      )}
    </span>
  );
}

type TaskDetailsPanelProps = TaskMetaProps & {
  id: string;
  open: boolean;
  /** The row's actions menu, shown at the end of the panel. */
  actions: ReactNode;
};

/**
 * Phones only. It wraps onto its own line under the title, indented past the
 * checkbox and flag so the details line up with the title. The due date and
 * the right-aligned categories share the first row, the status badge sits
 * below it, and the actions menu is at the end.
 */
function TaskDetailsPanel({
  id,
  open,
  actions,
  task,
  status,
  finished,
  overdue,
  now,
}: TaskDetailsPanelProps) {
  return (
    <div
      id={id}
      hidden={!open}
      className={cn(
        "flex w-full items-start gap-3 pl-14 text-xs text-ink-muted sm:hidden",
        finished && "text-ink/40"
      )}
    >
      {/* The title button ends 2px below its text, so the 10px of top padding
          puts the first row 12px under the title: the same as the gap-3
          between the rows. */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3 pt-2.5 pb-2">
        {task.categories.length > 0 || task.dueAt ? (
          // The date is on the left and the categories on the right. With no
          // date the categories start on the left. When the two do not fit
          // side by side, the categories wrap onto their own line.
          <div className="flex w-full flex-wrap items-center gap-3">
            {task.dueAt ? (
              <TaskDue dueAt={task.dueAt} overdue={overdue} now={now} />
            ) : null}
            {task.categories.length > 0 ? (
              <div
                className={cn(
                  "flex min-w-0 flex-wrap items-center gap-2",
                  task.dueAt && "ml-auto justify-end"
                )}
              >
                <TaskCategoryChips
                  categories={task.categories}
                  finished={finished}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <TaskStatusBadge status={status} />
      </div>
      {actions}
    </div>
  );
}

type TaskActionsMenuProps = {
  title: string;
  status: TaskStatus;
  pending: boolean;
  /** Sizing and visibility of the "⋯" button, which differ per breakpoint. */
  triggerClassName?: string;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
};

function TaskActionsMenu({
  title,
  status,
  pending,
  triggerClassName,
  onStatusChange,
  onDelete,
}: TaskActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("shrink-0", triggerClassName)}
            aria-label={`Aksi untuk ${title}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <div
          aria-hidden="true"
          className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-ink-muted"
        >
          Status
        </div>
        <DropdownMenuRadioGroup
          aria-label="Status"
          value={status}
          onValueChange={(value: unknown) => {
            if (isTaskStatus(value) && value !== status) onStatusChange(value);
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
  );
}

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPanelId = useId();

  const status = pendingStatus ?? task.status;
  const pending = pendingStatus !== undefined;
  const done = status === "done";
  const finished = done || status === "cancelled";
  const overdue = isTaskOverdue({ ...task, status }, now);
  const daysOverdue =
    overdue && task.dueAt ? countOverdueDays(task.dueAt, now) : 0;

  const priorityLabel = `Prioritas ${PRIORITY_LABELS[task.priority].toLowerCase()}`;

  // Phones fold a task's details (status badge, categories, due date) into a
  // panel behind a chevron. A task with none has no panel, so its actions
  // menu takes the chevron's place on the row.
  const hasDetails =
    status === "doing" ||
    status === "cancelled" ||
    task.categories.length > 0 ||
    Boolean(task.dueAt);

  return (
    <li
      aria-busy={pending || undefined}
      className="relative flex flex-wrap items-start gap-x-3 rounded-md py-1.5 pr-1 pl-2 transition-colors hover:bg-surface-1 sm:flex-nowrap sm:items-center sm:gap-x-4 sm:py-0"
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
        className="relative mt-1 size-4 rounded-md after:absolute after:-inset-3 sm:mt-0"
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
            finished && "text-ink/40 line-through decoration-ink/20"
          )}
        >
          {task.title}
          <span className="sr-only">, {priorityLabel.toLowerCase()}</span>
        </span>
        <TaskMeta
          task={task}
          status={status}
          finished={finished}
          overdue={overdue}
          now={now}
        />
      </button>
      {/* Phones fold the due date away, so an overdue task keeps a compact
          flag on the row itself: the same icon and size as the due date, then
          the days past due. It sits on the title's first line, close to the
          chevron (the negative margin cancels most of the row gap). */}
      {overdue ? (
        <span className="mt-0.5 flex h-5 shrink-0 items-center gap-1 text-xs font-semibold text-destructive tabular-nums max-sm:-mr-3 sm:hidden">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
          {daysOverdue > 0 ? (
            <span aria-hidden="true">{daysOverdue}</span>
          ) : null}
          <span className="sr-only">
            {daysOverdue > 0
              ? `Terlambat ${daysOverdue} hari`
              : "Terlambat hari ini"}
          </span>
        </span>
      ) : null}
      {hasDetails ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 max-sm:-my-2 max-sm:size-10 sm:hidden"
          aria-label={`Detail dan aksi untuk ${task.title}`}
          aria-expanded={detailsOpen}
          aria-controls={detailsPanelId}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <ChevronDown
            className={cn(
              "transition-transform duration-200 motion-reduce:transition-none",
              detailsOpen && "rotate-180"
            )}
          />
        </Button>
      ) : null}
      {/* From `sm` this is the row's menu. On phones it only shows here when
          there is no details panel, in the chevron's spot. */}
      <TaskActionsMenu
        title={task.title}
        status={status}
        pending={pending}
        triggerClassName={cn(
          "size-7 sm:-ml-2",
          hasDetails ? "max-sm:hidden" : "max-sm:-my-2 max-sm:size-10"
        )}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
      />
      {hasDetails ? (
        <TaskDetailsPanel
          id={detailsPanelId}
          open={detailsOpen}
          task={task}
          status={status}
          finished={finished}
          overdue={overdue}
          now={now}
          actions={
            <TaskActionsMenu
              title={task.title}
              status={status}
              pending={pending}
              triggerClassName="mt-1 h-8 w-10"
              onStatusChange={onStatusChange}
              onDelete={onDelete}
            />
          }
        />
      ) : null}
    </li>
  );
}

const SKELETON_WIDTHS = ["w-3/5", "w-2/5", "w-4/5", "w-1/2"];

export function TaskListSkeleton({ label }: { label: string }) {
  return (
    <ul
      className={cn(TASK_LIST_CARD_CLASS, "space-y-px")}
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
