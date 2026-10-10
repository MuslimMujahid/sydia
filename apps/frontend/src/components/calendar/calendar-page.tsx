import { useQuery } from "@tanstack/react-query";
import { Clock3, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DomainInlineError,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import { TaskEditor, TaskEditorLoader } from "@/components/tasks/task-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import type { CalendarEvent } from "@/lib/services/api/calendar/calendar.api";
import {
  getCalendarEvent,
  getGoogleCalendarAuthorizationUrl,
} from "@/lib/services/api/calendar/calendar.api";
import {
  calendarEventsQueryOptions,
  calendarStatusQueryOptions,
  useDeleteCalendarEvent,
  useDisconnectCalendar,
  useResolveCalendarOccurrence,
} from "@/lib/services/api/calendar/calendar.queries";
import {
  tasksQueryOptions,
  useDeleteTask,
  useSetTaskStatus,
} from "@/lib/services/api/tasks/tasks.queries";
import {
  dayKeyInZone,
  formatDayKeyLabel,
  formatViewTitle,
  getViewDayKeys,
  getViewRange,
  minutesOfDayInZone,
  shiftAnchor,
  toWallDateTime,
  type CalendarView,
  type DayKey,
} from "./calendar-date";
import { CalendarCreateMenu } from "./calendar-create-menu";
import { CalendarConnection } from "./calendar-connection";
import { CalendarToolbar, CalendarViewSelect } from "./calendar-toolbar";
import { EventEditor } from "./event-editor";
import { MonthView } from "./month-view";
import { ScheduleItemRow, ScheduleView } from "./schedule-view";
import {
  buildScheduleItems,
  groupItemsByDay,
  taskStatusOf,
  type ScheduleItem,
  type ScheduleItemKind,
} from "./schedule-items";
import { TimeGridView } from "./time-grid-view";
import { YearView } from "./year-view";

export type CalendarNavigation = { view?: CalendarView; date?: DayKey };

export type CalendarPageProps = {
  timezone: string;
  view: CalendarView;
  /** The anchor day; today when omitted. */
  date?: DayKey;
  /** The task open in the task editor, if any. */
  taskId?: string;
  /** Header control that switches between the calendar and task views. */
  modeSwitch: ReactNode;
  onNavigate: (next: CalendarNavigation) => void;
  onTaskIdChange: (taskId: string | undefined) => void;
};

type NewItemDraft = {
  kind: ScheduleItemKind;
  /** Wall-time "yyyy-MM-ddTHH:mm" prefills in the page time zone. */
  startAt?: string;
  endAt?: string;
};

type EditorState =
  | { mode: "edit-event"; event: CalendarEvent }
  | ({ mode: "new" } & NewItemDraft);

type RecurrenceAction = {
  mode: "edit" | "delete";
  event: CalendarEvent;
};

const CLOCK_TICK_MS = 60_000;

function isRecurringOccurrence(event: CalendarEvent): boolean {
  return event.isOccurrence === true;
}

function CalendarSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Memuat kalender"
      className="overflow-hidden rounded-lg bg-canvas lg:h-full"
    >
      <div className="grid grid-cols-7 gap-px bg-hairline lg:h-full lg:auto-rows-fr">
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="h-14 bg-canvas p-2 sm:h-28 lg:h-auto">
            <div className="size-6 animate-pulse rounded-pill bg-surface-1 motion-reduce:animate-none" />
            {index % 3 === 0 ? (
              <div className="mt-3 hidden h-3 w-4/5 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none sm:block" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The merged calendar: events and dated tasks together in day, week, month,
 * year, and schedule views.
 */
export function CalendarPage({
  timezone,
  view,
  date,
  taskId,
  modeSwitch,
  onNavigate,
  onTaskIdChange,
}: CalendarPageProps) {
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [recurrenceAction, setRecurrenceAction] =
    useState<RecurrenceAction | null>(null);

  const [recurrenceError, setRecurrenceError] = useState<string | null>(null);
  const [isResolvingRecurrence, setIsResolvingRecurrence] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const deleteEventKeys = useRef(new Map<string, string>());
  const isDesktop = useMediaQuery("(min-width: 40rem)");

  // Keeps "today" and the current-time line fresh on a page left open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  const todayKey = dayKeyInZone(now, timezone);
  const anchor = date ?? todayKey;
  const dayKeys = useMemo(() => getViewDayKeys(view, anchor), [view, anchor]);
  const range = useMemo(
    () => getViewRange(view, anchor, timezone),
    [view, anchor, timezone]
  );

  const statusQuery = useQuery(calendarStatusQueryOptions());
  const eventsQuery = useQuery({
    ...calendarEventsQueryOptions(range),
    placeholderData: (previous) => previous,
  });

  const tasksQuery = useQuery(tasksQueryOptions());
  const disconnectMutation = useDisconnectCalendar();
  const statusMutation = useSetTaskStatus();
  const deleteEventMutation = useDeleteCalendarEvent();
  const resolveOccurrenceMutation = useResolveCalendarOccurrence();
  const deleteTaskMutation = useDeleteTask();

  const pendingStatus = statusMutation.isPending
    ? statusMutation.variables
    : undefined;

  const itemsByDay = useMemo(
    () =>
      groupItemsByDay(
        buildScheduleItems(eventsQuery.data ?? [], tasksQuery.data ?? []),
        dayKeys,
        timezone
      ),
    [eventsQuery.data, tasksQuery.data, dayKeys, timezone]
  );

  const ready = !eventsQuery.isPending && !tasksQuery.isPending;

  function isDone(item: ScheduleItem): boolean {
    return (
      item.kind === "task" && taskStatusOf(item.task, pendingStatus) === "done"
    );
  }

  function isPending(item: ScheduleItem): boolean {
    if (item.kind !== "task") return false;

    return (
      pendingStatus?.taskId === item.task.id ||
      (deleteTaskMutation.isPending &&
        deleteTaskMutation.variables === item.task.id)
    );
  }

  /** Confirms, then cancels an event or deletes a task (as the editors do). */
  function deleteItem(item: ScheduleItem) {
    deleteEventMutation.reset();
    deleteTaskMutation.reset();

    if (item.kind === "event") {
      if (isRecurringOccurrence(item.event)) {
        setRecurrenceError(null);
        setRecurrenceAction({ mode: "delete", event: item.event });
      } else cancelEvent(item.event);

      return;
    }

    if (
      !window.confirm(
        `Hapus tugas “${item.title}”? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    deleteTaskMutation.mutate(item.task.id);
  }

  function toggleDone(item: ScheduleItem, done: boolean) {
    if (item.kind !== "task") return;
    statusMutation.mutate({
      taskId: item.task.id,
      status: done ? "done" : "inbox",
    });
  }

  function navigateTo(next: CalendarNavigation) {
    // Today is the default anchor, so it stays out of the URL.
    onNavigate({
      view: next.view ?? view,
      date: next.date === todayKey ? undefined : next.date,
    });
  }

  function openDay(dayKey: DayKey) {
    navigateTo({ view: "day", date: dayKey });
  }

  function editItem(item: ScheduleItem) {
    if (item.kind === "event") {
      if (isRecurringOccurrence(item.event)) {
        setRecurrenceError(null);
        setRecurrenceAction({ mode: "edit", event: item.event });
      } else setEditor({ mode: "edit-event", event: item.event });
    } else onTaskIdChange(item.task.id);
  }

  function cancelEvent(event: CalendarEvent) {
    if (!window.confirm(`Batalkan acara “${event.title}”?`)) return;
    const idempotencyKey =
      deleteEventKeys.current.get(event.id) ?? crypto.randomUUID();

    deleteEventKeys.current.set(event.id, idempotencyKey);
    deleteEventMutation.mutate(
      { eventId: event.id, idempotencyKey },
      { onSuccess: () => deleteEventKeys.current.delete(event.id) }
    );
  }

  async function chooseRecurrenceScope(scope: "occurrence" | "series") {
    const action = recurrenceAction;
    const seriesEventId = action?.event.seriesEventId;
    const occurrenceKey = action?.event.occurrenceKey;
    if (!action) return;

    if (!seriesEventId || !occurrenceKey) {
      setRecurrenceError(
        "Kejadian ini tidak memiliki identitas yang dapat disinkronkan. Muat ulang kalender dan coba lagi."
      );

      return;
    }

    setRecurrenceError(null);
    setIsResolvingRecurrence(true);
    resolveOccurrenceMutation.reset();

    try {
      const event =
        scope === "series"
          ? await getCalendarEvent(seriesEventId)
          : await resolveOccurrenceMutation.mutateAsync({
              seriesEventId,
              occurrenceKey,
              instanceEventId: action.event.instanceEventId,
            });

      setRecurrenceAction(null);
      if (action.mode === "edit") setEditor({ mode: "edit-event", event });
      else cancelEvent(event);
    } catch (error) {
      setRecurrenceError(
        error instanceof Error
          ? error.message
          : "Perubahan acara berulang tidak dapat dimulai."
      );
    } finally {
      setIsResolvingRecurrence(false);
    }
  }

  /**
   * Start a new item, prefilled on the given day (the anchor by default): at
   * the next full hour today, or 09.00 on other days.
   */
  function openCreate(
    dayKey: DayKey = anchor,
    minute?: number,
    kind: ScheduleItemKind = "event"
  ) {
    const nextHour = Math.min(
      (Math.floor(minutesOfDayInZone(now, timezone) / 60) + 1) * 60,
      23 * 60
    );

    const start = minute ?? (dayKey === todayKey ? nextHour : 9 * 60);

    setEditor({
      mode: "new",
      kind,
      startAt: toWallDateTime(dayKey, start),
      endAt: toWallDateTime(dayKey, Math.min(start + 60, 24 * 60 - 1)),
    });
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "Putuskan Google Calendar? Acara lokal di Sydia tetap tersimpan."
      )
    )
      return;
    await disconnectMutation.mutateAsync();
  }

  async function handleConnect() {
    setConnectError(null);
    setIsConnecting(true);

    try {
      window.location.assign(await getGoogleCalendarAuthorizationUrl());
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Koneksi Google Calendar tidak dapat dimulai."
      );
      setIsConnecting(false);
    }
  }

  const titleId = "calendar-view-title";
  const selectedItems = itemsByDay[anchor] ?? [];
  const actionError =
    disconnectMutation.error?.message ??
    connectError ??
    statusMutation.error?.message ??
    deleteEventMutation.error?.message ??
    deleteTaskMutation.error?.message;

  let body: ReactNode = null;

  if (ready)
    switch (view) {
      case "day":
      case "week":
        body = (
          <TimeGridView
            key={`${view}:${dayKeys[0] ?? anchor}`}
            days={dayKeys}
            todayKey={todayKey}
            now={now}
            timeZone={timezone}
            itemsByDay={itemsByDay}
            isDone={isDone}
            onOpenDay={openDay}
            onEditItem={editItem}
            onDeleteItem={deleteItem}
            onCreateAt={openCreate}
          />
        );
        break;
      case "month":
        body = (
          <MonthView
            anchor={anchor}
            todayKey={todayKey}
            timeZone={timezone}
            itemsByDay={itemsByDay}
            isDone={isDone}
            onSelectDay={(dayKey) =>
              isDesktop ? openDay(dayKey) : navigateTo({ date: dayKey })
            }
            onOpenDay={openDay}
            onEditItem={editItem}
            onDeleteItem={deleteItem}
            onCreateForDay={(dayKey) => openCreate(dayKey)}
          />
        );
        break;
      case "year":
        body = (
          <YearView
            anchor={anchor}
            todayKey={todayKey}
            itemsByDay={itemsByDay}
            onOpenDay={openDay}
            onOpenMonth={(dayKey) =>
              navigateTo({ view: "month", date: dayKey })
            }
          />
        );
        break;
      case "schedule":
        body = (
          <ScheduleView
            days={dayKeys}
            todayKey={todayKey}
            timeZone={timezone}
            itemsByDay={itemsByDay}
            isDone={isDone}
            isPending={isPending}
            onOpenDay={openDay}
            onEditItem={editItem}
            onDeleteItem={deleteItem}
            onToggleDone={toggleDone}
          />
        );
        break;
    }

  return (
    // From `lg` the page fills the panel's height and the active view takes
    // whatever the header and toolbar leave.
    <div className="space-y-6 pb-20 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:pb-0">
      <DomainPageHeader
        title="Kalender"
        divided={false}
        addAction={{
          label: "Buat",
          renderButton: (button) => (
            <CalendarCreateMenu
              onCreate={(kind) => openCreate(anchor, undefined, kind)}
            >
              {button}
            </CalendarCreateMenu>
          ),
        }}
        titleAction={
          <div className="flex items-center gap-2 sm:gap-3">
            {modeSwitch}
            <CalendarViewSelect
              view={view}
              onViewChange={(nextView) => navigateTo({ view: nextView, date })}
            />
          </div>
        }
        action={
          <CalendarConnection
            isPending={statusQuery.isPending}
            error={statusQuery.error?.message ?? null}
            connected={statusQuery.data?.connected}
            available={statusQuery.data?.available}
            isConnecting={isConnecting}
            isDisconnecting={disconnectMutation.isPending}
            onConnect={() => void handleConnect()}
            onDisconnect={() => void handleDisconnect()}
          />
        }
      />
      <section
        aria-labelledby={titleId}
        className="space-y-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
      >
        <CalendarToolbar
          view={view}
          title={formatViewTitle(view, anchor)}
          titleId={titleId}
          onToday={() => navigateTo({ date: todayKey })}
          onStep={(delta) =>
            navigateTo({ date: shiftAnchor(view, anchor, delta) })
          }
        />
        {actionError ? (
          <p className="text-sm text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
        {eventsQuery.isError ? (
          <DomainInlineError
            title="Acara tidak dapat dimuat"
            message={eventsQuery.error.message}
            onRetry={() => void eventsQuery.refetch()}
          />
        ) : null}
        {tasksQuery.isError ? (
          <DomainInlineError
            title="Tugas tidak dapat dimuat"
            message={tasksQuery.error.message}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : null}
        <div className="lg:min-h-0 lg:flex-1">
          {ready ? body : <CalendarSkeleton />}
        </div>
      </section>
      {/*
        Phones only: month cells show markers but no titles, so this list is
        how items on the selected day are opened on small screens.
      */}
      {ready && view === "month" ? (
        <section
          aria-labelledby="calendar-selected-day-title"
          className="sm:hidden"
        >
          <div className="flex items-center gap-3 border-b border-hairline pb-3">
            <Clock3 aria-hidden="true" className="size-5 text-ink-muted" />
            <h2
              id="calendar-selected-day-title"
              className="font-display text-[17px] font-semibold capitalize"
            >
              {formatDayKeyLabel(anchor)}
            </h2>
          </div>
          {selectedItems.length ? (
            <ul className="-mx-2 py-2">
              {selectedItems.map((item) => (
                <ScheduleItemRow
                  key={item.key}
                  item={item}
                  dayKey={anchor}
                  timeZone={timezone}
                  done={isDone(item)}
                  pending={isPending(item)}
                  onEdit={() => editItem(item)}
                  onDelete={() => deleteItem(item)}
                  onToggleDone={(done) => toggleDone(item, done)}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 py-5">
              <p className="text-sm text-ink-muted">
                Tidak ada acara atau tugas pada hari ini.
              </p>
              <CalendarCreateMenu
                onCreate={(kind) => openCreate(anchor, undefined, kind)}
              >
                <Button variant="dark-outline" size="sm">
                  <Plus /> Buat
                </Button>
              </CalendarCreateMenu>
            </div>
          )}
        </section>
      ) : null}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        {editor?.mode === "edit-event" ? (
          <EventEditor
            key={editor.event.id}
            event={editor.event}
            googleConnected={statusQuery.data?.connected === true}
            timezone={timezone}
            onClose={() => setEditor(null)}
          />
        ) : editor?.mode === "new" ? (
          editor.kind === "event" ? (
            <EventEditor
              key={`new-event-${editor.startAt ?? "blank"}`}
              googleConnected={statusQuery.data?.connected === true}
              initialStartAt={editor.startAt}
              initialEndAt={editor.endAt}
              timezone={timezone}
              onClose={() => setEditor(null)}
            />
          ) : (
            <TaskEditor
              key={`new-task-${editor.startAt ?? "blank"}`}
              initialDueAt={editor.startAt}
              onClose={() => setEditor(null)}
            />
          )
        ) : null}
      </Dialog>
      <Dialog
        open={recurrenceAction !== null}
        onOpenChange={(open) => {
          if (!open && !isResolvingRecurrence) {
            setRecurrenceAction(null);
            setRecurrenceError(null);
          }
        }}
      >
        {recurrenceAction ? (
          <DialogContent variant="sheet" className="sm:max-w-lg">
            <DialogTitle>Acara berulang</DialogTitle>
            <DialogDescription className="mt-2">
              {recurrenceAction.mode === "edit"
                ? "Pilih bagian acara yang ingin Anda ubah."
                : "Pilih bagian acara yang ingin Anda batalkan."}
            </DialogDescription>
            <div className="mt-6 grid gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={
                  isResolvingRecurrence ||
                  !["google", "local"].includes(
                    recurrenceAction.event.provider
                  ) ||
                  (recurrenceAction.event.provider === "google" &&
                    statusQuery.data?.connected !== true)
                }
                onClick={() => void chooseRecurrenceScope("occurrence")}
              >
                {recurrenceAction.mode === "edit"
                  ? "Ubah kejadian ini"
                  : "Batalkan kejadian ini"}
              </Button>
              {recurrenceAction.event.provider === "local" ? (
                <p className="text-sm text-ink-muted">
                  Perubahan ini hanya berlaku untuk kejadian di Sydia.
                </p>
              ) : recurrenceAction.event.provider !== "google" ? (
                <p className="text-sm text-ink-muted">
                  Perubahan satu kejadian belum tersedia untuk rangkaian ini.
                </p>
              ) : statusQuery.data?.connected !== true ? (
                <p className="text-sm text-ink-muted">
                  Hubungkan kembali Google Calendar untuk mengubah satu
                  kejadian.
                </p>
              ) : null}
              <Button
                type="button"
                variant="dark-outline"
                disabled={isResolvingRecurrence}
                onClick={() => void chooseRecurrenceScope("series")}
              >
                {recurrenceAction.mode === "edit"
                  ? "Ubah seluruh rangkaian"
                  : "Batalkan seluruh rangkaian"}
              </Button>
            </div>
            {isResolvingRecurrence ? (
              <p role="status" className="mt-4 text-sm text-ink-muted">
                {recurrenceAction.event.provider === "google"
                  ? "Memeriksa acara di Google Calendar…"
                  : "Menyiapkan kejadian di Sydia…"}
              </p>
            ) : null}
            {recurrenceError ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {recurrenceError}
              </p>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
      <Dialog
        open={taskId !== undefined}
        onOpenChange={(open) => !open && onTaskIdChange(undefined)}
      >
        {taskId ? (
          <TaskEditorLoader
            key={taskId}
            taskId={taskId}
            onClose={() => onTaskIdChange(undefined)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
