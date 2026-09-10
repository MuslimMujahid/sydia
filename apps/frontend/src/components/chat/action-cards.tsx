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
import { useResolveToolConfirmation } from "@/lib/services/api/conversations/conversations.queries";
import type { TaskStatus } from "@/lib/services/api/tasks/tasks.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";

const TASK_STATUS_LABELS: Record<
  SupportedLocale,
  Record<TaskStatus, string>
> = {
  en: {
    inbox: "Inbox",
    doing: "In progress",
    done: "Completed",
    cancelled: "Cancelled",
  },
  id: {
    inbox: "Inbox",
    doing: "Dikerjakan",
    done: "Selesai",
    cancelled: "Dibatalkan",
  },
};

function formatActionDateTime(value: string | null, locale: SupportedLocale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const TASK_TOOL_NAMES: Record<string, true> = {
  create_task: true,
  update_task: true,
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
  if (invocation.objectType === "task" || invocation.objectType === "reminder")
    return invocation.objectType;
  if (TASK_TOOL_NAMES[invocation.name]) return "task";
  if (REMINDER_TOOL_NAMES[invocation.name]) return "reminder";

  return null;
}

function TaskActionCard({
  invocation,
  locale,
}: {
  invocation: ToolInvocation;
  locale: SupportedLocale;
}) {
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
      className="rounded-lg border border-ink/6 bg-canvas p-5 shadow-card"
      aria-label={`${locale === "en" ? "Task action" : "Tindakan tugas"}: ${object.title}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-1">
          <CheckSquare2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            {locale === "en" ? "Task saved" : "Tugas tersimpan"}
          </p>
          <h3 className="mt-0.5 font-display font-bold text-ink">
            {object.title}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {locale === "en" ? "Status" : "Status"}:{" "}
            {TASK_STATUS_LABELS[locale][status]}
          </p>
          {dueAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarClock className="size-3.5" />
              {formatActionDateTime(dueAt, locale)}
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
            ? locale === "en"
              ? "Task cancelled"
              : "Tugas dibatalkan"
            : done
              ? locale === "en"
                ? "Move back to inbox"
                : "Kembalikan ke inbox"
              : locale === "en"
                ? "Mark complete"
                : "Tandai selesai"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<Link to="/tasks" search={{ id: object.id }} />}
        >
          {locale === "en" ? "View task" : "Lihat tugas"}
        </Button>
      </div>
    </section>
  );
}

function ReminderActionCard({
  invocation,
  locale,
}: {
  invocation: ToolInvocation;
  locale: SupportedLocale;
}) {
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
      className="rounded-lg border border-ink/6 bg-canvas p-5 shadow-card"
      aria-label={`${locale === "en" ? "Reminder action" : "Tindakan pengingat"}: ${object.title}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-1">
          <AlarmClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            {locale === "en" ? "Reminder saved" : "Pengingat tersimpan"}
          </p>
          <h3 className="mt-0.5 font-display font-bold text-ink">
            {object.title}
          </h3>
          {scheduledAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarClock className="size-3.5" />
              {formatActionDateTime(scheduledAt, locale)}
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
              <Check /> {locale === "en" ? "Complete" : "Selesai"}
            </Button>
            <Button
              size="sm"
              variant="dark-outline"
              disabled={pending}
              onClick={snoozeOneHour}
            >
              <AlarmClock /> {locale === "en" ? "Snooze 1 hour" : "Tunda 1 jam"}
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
              <Ban /> {locale === "en" ? "Cancel" : "Batalkan"}
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<Link to="/reminders" />}
        >
          {locale === "en" ? "Manage reminder" : "Atur pengingat"}
        </Button>
      </div>
    </section>
  );
}

function CategoryConfirmationCard({
  invocation,
  locale,
}: {
  invocation: ToolInvocation;
  locale: SupportedLocale;
}) {
  const mutation = useResolveToolConfirmation();
  const output = asRecord(invocation.output);
  const args = asRecord(output?.arguments);
  const categoryName =
    stringValue(args, "name") ??
    stringValue(args, "categoryName") ??
    (locale === "en" ? "this category" : "kategori ini");

  const action =
    invocation.name === "delete_category"
      ? locale === "en"
        ? "delete"
        : "menghapus"
      : invocation.name === "update_category"
        ? locale === "en"
          ? "update"
          : "memperbarui"
        : locale === "en"
          ? "create"
          : "membuat";

  const taskCount = typeof args?.taskCount === "number" ? args.taskCount : null;

  return (
    <section
      className="rounded-lg border border-warn/35 bg-warn/5 p-5"
      aria-label={`${locale === "en" ? "Confirmation" : "Konfirmasi"} ${invocation.label}`}
    >
      <p className="text-xs font-semibold tracking-wide text-warn uppercase">
        {locale === "en" ? "Approval required" : "Perlu persetujuan"}
      </p>
      <h3 className="mt-1 font-display font-bold text-ink">
        {locale === "en"
          ? `Sydia will ${action} category “${categoryName}”`
          : `Sydia akan ${action} kategori “${categoryName}”`}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        {locale === "en"
          ? "This change applies to all tasks using this category."
          : "Perubahan ini berlaku di seluruh tugas yang menggunakan kategori tersebut."}
        {invocation.name === "delete_category" && taskCount !== null
          ? locale === "en"
            ? ` The category will be removed from ${taskCount} tasks.`
            : ` Kategori akan dilepas dari ${taskCount} tugas.`
          : ""}
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({ invocationId: invocation.id, approved: true })
          }
        >
          {locale === "en" ? "Approve" : "Setujui"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({ invocationId: invocation.id, approved: false })
          }
        >
          {locale === "en" ? "Decline" : "Tolak"}
        </Button>
      </div>
    </section>
  );
}

export function ChatActionCards({
  invocations,
  locale,
}: {
  invocations: ToolInvocation[];
  locale: SupportedLocale;
}) {
  const actions = useMemo(
    () =>
      invocations.filter(
        (invocation) =>
          invocation.status === "awaiting_confirmation" ||
          (invocation.status === "completed" &&
            invocationKind(invocation) !== null)
      ),
    [invocations]
  );

  if (!actions.length) return null;

  return (
    <div className="mt-4 max-w-xl space-y-3">
      {actions.map((invocation) =>
        invocation.status === "awaiting_confirmation" ? (
          <CategoryConfirmationCard
            key={invocation.id}
            invocation={invocation}
            locale={locale}
          />
        ) : invocationKind(invocation) === "task" ? (
          <TaskActionCard
            key={invocation.id}
            invocation={invocation}
            locale={locale}
          />
        ) : invocationKind(invocation) === "reminder" ? (
          <ReminderActionCard
            key={invocation.id}
            invocation={invocation}
            locale={locale}
          />
        ) : null
      )}
    </div>
  );
}
