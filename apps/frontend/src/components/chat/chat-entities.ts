import { z } from "zod";
import type { ToolInvocation } from "@/lib/services/api/conversations/conversations.api";

const text = z.string().trim().min(1);
const instant = z.iso.datetime({ offset: true });
const timezone = text.refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });

    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}, "Invalid timezone");

const recurrence = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  endsAt: instant.nullable().optional(),
});

const identity = { id: text, title: text };
const taskSchema = z.object({
  ...identity,
  status: z.enum(["inbox", "done", "cancelled"]).optional(),
  dueAt: instant.nullable().optional(),
});

const reminderSchema = z.object({
  ...identity,
  scheduledAt: instant.optional(),
  timezone: timezone.optional(),
  recurrence: recurrence.nullable().optional(),
});

const fileSchema = z.object({
  ...identity,
  mimeType: text.optional(),
  size: z.number().nonnegative().optional(),
  status: z.enum(["processing", "ready", "failed"]).optional(),
  url: z.url().optional(),
});

const eventIdentity = {
  ...identity,
  status: z.enum(["confirmed", "cancelled"]).optional(),
  location: z.string().nullable().optional(),
};

const calendarDay = z
  .union([z.iso.date(), instant])
  .transform((value) => value.slice(0, 10));

const eventSchema = z.union([
  z.object({
    ...eventIdentity,
    startAt: instant,
    endAt: instant,
    timezone,
    allDayStartDate: z.null().optional(),
    allDayEndDate: z.null().optional(),
  }),
  z
    .object({
      ...eventIdentity,
      startAt: z.null().optional(),
      endAt: z.null().optional(),
      timezone: timezone.nullable().optional(),
      allDayStartDate: calendarDay,
      allDayEndDate: calendarDay,
    })
    .refine(
      (event) => event.allDayEndDate > event.allDayStartDate,
      "All-day end date must be exclusive and after the start date"
    ),
]);

type EntityContext = { mutation: boolean; observedAt: string };
export type ChatEntity = EntityContext &
  (
    | ({ kind: "task" } & z.infer<typeof taskSchema>)
    | ({ kind: "reminder" } & z.infer<typeof reminderSchema>)
    | ({ kind: "file" } & z.infer<typeof fileSchema>)
    | ({ kind: "event" } & z.infer<typeof eventSchema>)
  );
export type EntityDiagnostic = { invocationId: string; reason: string };
export type EntityCollection = {
  entities: ChatEntity[];
  diagnostics: EntityDiagnostic[];
};

type ToolShape = { kind: ChatEntity["kind"]; list?: string; mutation: boolean };
const TOOL_SHAPES: Readonly<Record<string, ToolShape>> = {
  create_task: { kind: "task", mutation: true },
  update_task: { kind: "task", mutation: true },
  list_tasks: { kind: "task", list: "tasks", mutation: false },
  create_reminder: { kind: "reminder", list: "reminders", mutation: true },
  update_reminder: { kind: "reminder", mutation: true },
  snooze_reminder: { kind: "reminder", mutation: true },
  reschedule_reminder: { kind: "reminder", mutation: true },
  list_reminders: { kind: "reminder", list: "reminders", mutation: false },
  list_documents: { kind: "file", list: "documents", mutation: false },
  search_documents: { kind: "file", list: "sources", mutation: false },
  read_document: { kind: "file", mutation: false },
  save_attached_files: { kind: "file", list: "objects", mutation: true },
  send_file: { kind: "file", mutation: true },
  list_calendar_events: { kind: "event", list: "events", mutation: false },
  create_calendar_event: { kind: "event", mutation: true },
  update_calendar_event: { kind: "event", mutation: true },
  cancel_calendar_event: { kind: "event", mutation: true },
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function entityKey(entity: Pick<ChatEntity, "kind" | "id">): string {
  return `${entity.kind}:${entity.id}`;
}

/** Only confirmed tool records from this answer may become entity references. */
export function collectChatEntities(
  invocations: ToolInvocation[]
): EntityCollection {
  const entities = new Map<string, ChatEntity>();
  const diagnostics: EntityDiagnostic[] = [];

  for (const invocation of [...invocations].sort((a, b) =>
    a.updatedAt.localeCompare(b.updatedAt)
  )) {
    if (invocation.status !== "completed") continue;
    const shape = TOOL_SHAPES[invocation.name];
    if (!shape) continue;
    const output = record(invocation.output);
    // Older persisted tools may expose a single record through state instead.
    const listed = shape.list && output?.[shape.list];
    const candidates = Array.isArray(listed)
      ? listed
      : shape.list && listed !== undefined
        ? [listed]
        : [
            output?.object ??
              output?.[shape.kind] ??
              invocation.state ??
              output,
          ];

    for (const candidate of candidates) {
      const value = record(candidate);
      const normalized =
        shape.kind === "file" && value
          ? {
              ...value,
              id: value.documentId ?? value.id,
              title: value.filename ?? value.title,
            }
          : value;

      const schema = {
        task: taskSchema,
        reminder: reminderSchema,
        file: fileSchema,
        event: eventSchema,
      }[shape.kind];

      const parsed = schema.safeParse(normalized);

      if (!parsed.success) {
        diagnostics.push({
          invocationId: invocation.id,
          reason: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        });
        continue;
      }

      const entity = {
        ...parsed.data,
        kind: shape.kind,
        mutation: shape.mutation,
        observedAt: invocation.updatedAt,
      } as ChatEntity;

      const key = entityKey(entity);
      const previous = entities.get(key);
      // Keep the newest snapshot, including a successful mutation earlier in this run.
      entities.set(key, {
        ...previous,
        ...entity,
        mutation: entity.mutation || previous?.mutation === true,
      } as ChatEntity);
    }
  }

  return { entities: [...entities.values()], diagnostics };
}

export type EntityTextPart = { text: string; entity?: ChatEntity };
const WORD = /[\p{L}\p{N}_]/u;

/** Literal, Unicode-aware name matching; duplicate names must never guess an ID. */
export function matchEntityText(
  value: string,
  entities: ChatEntity[]
): EntityTextPart[] {
  const names = new Map<string, ChatEntity[]>();

  for (const entity of entities) {
    const name = entity.title.toLocaleLowerCase();
    const matches = names.get(name) ?? [];
    if (!matches.some((match) => entityKey(match) === entityKey(entity)))
      matches.push(entity);
    names.set(name, matches);
  }

  const candidates = [...names.entries()].sort(
    ([a], [b]) => b.length - a.length
  );

  const parts: EntityTextPart[] = [];
  let textStart = 0;

  for (let index = 0; index < value.length;) {
    const match = candidates.find(([name]) => {
      const slice = value.slice(index, index + name.length);

      return (
        slice.toLocaleLowerCase() === name &&
        !(WORD.test(name[0]!) && WORD.test(value[index - 1] ?? "")) &&
        !(
          WORD.test(name.at(-1)!) && WORD.test(value[index + name.length] ?? "")
        )
      );
    });

    if (!match) {
      index += 1;
      continue;
    }

    const [name, records] = match;

    if (records.length === 1) {
      if (index > textStart)
        parts.push({ text: value.slice(textStart, index) });
      parts.push({
        text: value.slice(index, index + name.length),
        entity: records[0],
      });
      textStart = index + name.length;
    }

    // An ambiguous long name also blocks a shorter name inside it.
    index += name.length;
  }

  if (textStart < value.length) parts.push({ text: value.slice(textStart) });

  return parts;
}
