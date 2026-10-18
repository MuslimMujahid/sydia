import { z } from "zod";
import type { ToolInvocation } from "@/lib/services/api/conversations/conversations.api";

const customRef = z.string().regex(/^custom:[a-zA-Z0-9_-]+$/);
const dailyRef = z
  .string()
  .regex(/^daily:\d{4}-\d{2}-\d{2}$/)
  .refine((ref) => z.iso.date().safeParse(ref.slice(6)).success);

export const noteReferenceSchema = z.union([customRef, dailyRef]);
const metadata = z.object({
  ref: noteReferenceSchema,
  title: z.string().trim().min(1),
  path: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type ChatNoteEntity = z.infer<typeof metadata> & {
  kind: "note";
  id: string;
  mutation: boolean;
  observedAt: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const tools = new Set([
  "list_notes_workspace",
  "search_notes",
  "read_custom_note",
  "create_custom_note",
  "update_custom_note",
  "manage_notes_item",
  "read_daily_note",
  "write_daily_note",
  "search_daily_notes",
]);

/** Normalize actual tool contracts; a title alone never proves note identity. */
export function collectNoteEntities(invocation: ToolInvocation): {
  entities: ChatNoteEntity[];
  diagnostics: Array<{ invocationId: string; reason: string }>;
} {
  const result: ReturnType<typeof collectNoteEntities> = {
    entities: [],
    diagnostics: [],
  };

  if (invocation.status !== "completed" || !tools.has(invocation.name))
    return result;
  const output = record(invocation.output);

  if (!output) {
    result.diagnostics.push({
      invocationId: invocation.id,
      reason: "Note tool returned no record",
    });

    return result;
  }

  const mutation = [
    "create_custom_note",
    "update_custom_note",
    "write_daily_note",
    "manage_notes_item",
  ].includes(invocation.name);

  const candidates = Array.isArray(output.notes) ? output.notes : [output];

  for (const candidate of candidates) {
    const value = record(candidate);

    if (!value) {
      result.diagnostics.push({
        invocationId: invocation.id,
        reason: "Invalid note result",
      });
      continue;
    }

    if (
      value.kind === "folder" ||
      value.trashedAt ||
      value.found === false ||
      value.deleted === true
    )
      continue;
    const daily = invocation.name.includes("daily_note");
    const date = value.date;
    const normalized = daily
      ? {
          ...value,
          ref: typeof date === "string" ? `daily:${date}` : undefined,
          title: date,
        }
      : {
          ...value,
          ref:
            value.ref ??
            (typeof value.id === "string" && value.kind === "note"
              ? `custom:${value.id}`
              : undefined),
        };

    const parsed = metadata.safeParse(normalized);

    if (!parsed.success) {
      result.diagnostics.push({
        invocationId: invocation.id,
        reason: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
      continue;
    }

    result.entities.push({
      ...parsed.data,
      kind: "note",
      id: parsed.data.ref,
      mutation,
      observedAt: invocation.updatedAt,
    });
  }

  return result;
}
