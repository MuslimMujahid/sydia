import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  Ban,
  CalendarClock,
  Check,
  CheckSquare2,
  LoaderCircle,
  Inbox,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { ToolInvocation } from "@/lib/services/api/conversations/conversations.api";
import {
  useSetReminderStatus,
  useSnoozeReminder,
} from "@/lib/services/api/reminders/reminders.queries";
import { useSetTaskStatus } from "@/lib/services/api/tasks/tasks.queries";
import type { TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import { formatDateTime } from "@/lib/utils/date-time";

const TASK_TOOL_NAMES: Record<string, true> = {
  create_task: true,
  update_task: true,
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  doing: "Dikerjakan",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

const REMINDER_TOOL_NAMES: Record<string, true> = {
  create_reminder: true,
  update_reminder: true,
  complete_reminder: true,
  snooze_reminder: true,
  reschedule_reminder: true,
  cancel_reminder: true,
};

type ActionObject = {
  id: string;
  title: string;
  status: string | null;
  scheduledAt: string | null;
  dueAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(
  record: Record<string, unknown> | null,
  key: string
): string | null {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function taskStatus(value: string | null): TaskStatus {
  return value === "doing" || value === "done" || value === "cancelled"
    ? value
    : "inbox";
}

function actionObject(invocation: ToolInvocation): ActionObject | null {
  const output = asRecord(invocation.output);
  const nested = asRecord(output?.task) ?? asRecord(output?.reminder) ?? output;
  const state = invocation.state;
  const id =
    invocation.objectId ??
    stringValue(nested, "id") ??
    stringValue(state, "id");

  if (!id) return null;

  return {
    id,
    title:
      stringValue(nested, "title") ??
      stringValue(state, "title") ??
      invocation.label,
    status: stringValue(nested, "status") ?? stringValue(state, "status"),
    scheduledAt:
      stringValue(nested, "scheduledAt") ?? stringValue(state, "scheduledAt"),
    dueAt: stringValue(nested, "dueAt") ?? stringValue(state, "dueAt"),
  };
}

function invocationKind(
  invocation: ToolInvocation
): "task" | "reminder" | null {
  if (invocation.objectType) return invocation.objectType;
  if (TASK_TOOL_NAMES[invocation.name]) return "task";
  if (REMINDER_TOOL_NAMES[invocation.name]) return "reminder";

  return null;
}

function TaskActionCard({ invocation }: { invocation: ToolInvocation }) {
  const mutation = useSetTaskStatus();
  const object = actionObject(invocation);
  if (!object) return null;
  const current = mutation.data?.id === object.id ? mutation.data : null;
  const status = current?.status ?? taskStatus(object.status);
  const done = status === "done";
  const cancelled = status === "cancelled";
  const dueAt = current?.dueAt ?? object.dueAt;

  return (
    <section
      className="rounded-xl border border-surface-1 bg-canvas p-4"
      aria-label={`Tindakan tugas: ${object.title}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-1">
          <CheckSquare2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">Tugas tersimpan</p>
          <h3 className="mt-0.5 font-display font-bold text-ink">
            {object.title}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Status: {TASK_STATUS_LABELS[status]}
          </p>
          {dueAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarClock className="size-3.5" />
              {formatDateTime(dueAt)}
            </p>
          ) : null}
        </div>
      </div>
      {mutation.error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={done ? "secondary" : "primary"}
          disabled={mutation.isPending || cancelled}
          onClick={() =>
            mutation.mutate({
              taskId: object.id,
              status: done ? "inbox" : "done",
            })
          }
        >
          {mutation.isPending ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          ) : done ? (
            <Inbox />
          ) : (
            <Check />
          )}
          {cancelled
            ? "Tugas dibatalkan"
            : done
              ? "Kembalikan ke inbox"
              : "Tandai selesai"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<Link to="/tasks" />}
        >
          Lihat tugas
        </Button>
      </div>
    </section>
  );
}

function ReminderActionCard({ invocation }: { invocation: ToolInvocation }) {
  const statusMutation = useSetReminderStatus();
  const snoozeMutation = useSnoozeReminder();
  const object = actionObject(invocation);
  if (!object) return null;
  const current =
    statusMutation.data?.id === object.id
      ? statusMutation.data
      : snoozeMutation.data?.id === object.id
        ? snoozeMutation.data
        : null;

  const status = current?.status ?? object.status;
  const scheduledAt = current?.scheduledAt ?? object.scheduledAt;
  const active = status === "scheduled" || status === null;

  function snoozeOneHour() {
    if (!object) return;
    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    const from =
      Number.isNaN(base.getTime()) || base.getTime() < Date.now()
        ? new Date()
        : base;

    snoozeMutation.mutate({
      reminderId: object.id,
      until: new Date(from.getTime() + 3_600_000).toISOString(),
    });
  }

  const error = statusMutation.error ?? snoozeMutation.error;
  const pending = statusMutation.isPending || snoozeMutation.isPending;

  return (
    <section
      className="rounded-xl border border-surface-1 bg-canvas p-4"
      aria-label={`Tindakan pengingat: ${object.title}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-1">
          <AlarmClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">Pengingat tersimpan</p>
          <h3 className="mt-0.5 font-display font-bold text-ink">
            {object.title}
          </h3>
          {scheduledAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarClock className="size-3.5" />
              {formatDateTime(scheduledAt)}
            </p>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {active ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                statusMutation.mutate({
                  reminderId: object.id,
                  status: "completed",
                })
              }
            >
              <Check /> Selesai
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={snoozeOneHour}
            >
              <AlarmClock /> Tunda 1 jam
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                statusMutation.mutate({
                  reminderId: object.id,
                  status: "cancelled",
                })
              }
            >
              <Ban /> Batalkan
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<Link to="/reminders" />}
        >
          Atur pengingat
        </Button>
      </div>
    </section>
  );
}

export function ChatActionCards({
  invocations,
}: {
  invocations: ToolInvocation[];
}) {
  const actions = useMemo(
    () =>
      invocations.filter(
        (invocation) =>
          invocation.status === "completed" &&
          invocationKind(invocation) !== null
      ),
    [invocations]
  );

  if (!actions.length) return null;

  return (
    <div className="mt-4 max-w-xl space-y-3">
      {actions.map((invocation) =>
        invocationKind(invocation) === "task" ? (
          <TaskActionCard key={invocation.id} invocation={invocation} />
        ) : (
          <ReminderActionCard key={invocation.id} invocation={invocation} />
        )
      )}
    </div>
  );
}
