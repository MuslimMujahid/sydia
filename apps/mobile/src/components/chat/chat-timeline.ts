import type {
  AssistantActivity,
  AssistantRun,
  ConversationMessage,
  ToolInvocation,
} from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { dayKeyInZone, formatConversationDay } from "@/lib/utils/date-time";

/** Ported from apps/frontend/src/components/chat/message-history.tsx. */
const TOOL_LABELS: Record<string, { en: string; id: string }> = {
  get_current_datetime: {
    en: "View current time",
    id: "Melihat waktu saat ini",
  },
  create_task: { en: "Create task", id: "Membuat tugas" },
  update_task: { en: "Update task", id: "Memperbarui tugas" },
  list_tasks: { en: "Find tasks", id: "Mencari tugas" },
  create_reminder: { en: "Create reminder", id: "Membuat pengingat" },
  update_reminder: { en: "Update reminder", id: "Memperbarui pengingat" },
  save_memory: { en: "Save memory", id: "Menyimpan memori" },
  update_memory: { en: "Update memory", id: "Memperbarui memori" },
  forget_memory: { en: "Forget memory", id: "Menghapus memori" },
  search_memories: { en: "Search memories", id: "Mencari memori" },
  list_categories: { en: "View categories", id: "Melihat kategori" },
  create_category: { en: "Create category", id: "Membuat kategori" },
  update_category: { en: "Update category", id: "Memperbarui kategori" },
  delete_category: { en: "Delete category", id: "Menghapus kategori" },
  store_secret: { en: "Store secret", id: "Menyimpan rahasia" },
  create_secret_reveal_link: {
    en: "Create secret reveal link",
    id: "Membuat tautan rahasia",
  },
  save_contact: { en: "Save contact", id: "Menyimpan kontak" },
  resolve_contact: { en: "Find contact", id: "Mencari kontak" },
  list_contacts: { en: "Find contacts", id: "Mencari kontak" },
  list_contact_groups: { en: "View contact groups", id: "Melihat grup kontak" },
  create_contact_group: {
    en: "Create contact group",
    id: "Membuat grup kontak",
  },
  update_contact_group: {
    en: "Update contact group",
    id: "Memperbarui grup kontak",
  },
  delete_contact_group: {
    en: "Delete contact group",
    id: "Menghapus grup kontak",
  },
  assign_contact_groups: {
    en: "Update contact groups",
    id: "Memperbarui grup kontak",
  },
  list_documents: { en: "List files", id: "Menampilkan file" },
  read_document: { en: "Read document", id: "Membaca dokumen" },
  save_attached_files: {
    en: "Save attached files",
    id: "Menyimpan file terlampir",
  },
  search_documents: { en: "Search documents", id: "Mencari dokumen" },
  list_calendar_events: {
    en: "Find calendar events",
    id: "Mencari acara kalender",
  },
  create_calendar_event: {
    en: "Create calendar event",
    id: "Membuat acara kalender",
  },
  update_calendar_event: {
    en: "Update calendar event",
    id: "Memperbarui acara kalender",
  },
  cancel_calendar_event: {
    en: "Cancel calendar event",
    id: "Membatalkan acara kalender",
  },
};

export function toolLabel(
  invocation: ToolInvocation,
  locale: SupportedLocale
): string {
  return TOOL_LABELS[invocation.name]?.[locale] ?? invocation.label;
}

export function queuedActivity(locale: SupportedLocale): AssistantActivity {
  return {
    phase: "queued",
    label: locale === "en" ? "Waiting for its turn…" : "Menunggu giliran…",
  };
}

/** What Sydia is doing for a run that is still queued or running. */
export function currentActivity(
  run: AssistantRun,
  toolInvocations: ToolInvocation[],
  locale: SupportedLocale
): AssistantActivity {
  const latestTool = toolInvocations.at(-1);

  if (
    latestTool &&
    (latestTool.status === "pending" || latestTool.status === "running")
  ) {
    const label = toolLabel(latestTool, locale);

    return {
      phase: "executing_tool",
      label:
        locale === "en"
          ? `Sydia is ${label.toLocaleLowerCase("en-US")}…`
          : `Sydia sedang ${label.toLocaleLowerCase("id-ID")}…`,
    };
  }

  if (run.status === "queued") return queuedActivity(locale);

  return {
    phase: "preparing",
    label:
      locale === "en"
        ? "Sydia is preparing an answer…"
        : "Sydia sedang menyiapkan jawaban…",
  };
}

export type DocumentSource = {
  documentId: string;
  documentName: string;
  locations: string[];
  excerpts: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Documents an answer read or searched, grouped with page/section hints. */
export function documentSources(
  invocations: ToolInvocation[],
  locale: SupportedLocale
): DocumentSource[] {
  const grouped = new Map<string, DocumentSource>();

  for (const invocation of invocations) {
    if (
      invocation.name !== "search_documents" &&
      invocation.name !== "read_document"
    )
      continue;
    const output = asRecord(invocation.output);
    const values =
      invocation.name === "search_documents" ? output?.sources : output?.chunks;

    if (!Array.isArray(values)) continue;
    const documentId =
      typeof output?.documentId === "string" ? output.documentId : null;
    const filename =
      typeof output?.filename === "string" ? output.filename : null;

    for (const value of values) {
      const source = asRecord(value);
      if (!source) continue;
      const sourceDocumentId =
        typeof source.documentId === "string" ? source.documentId : documentId;
      const sourceFilename =
        typeof source.filename === "string" ? source.filename : filename;

      if (!sourceDocumentId || !sourceFilename) continue;
      const current = grouped.get(sourceDocumentId) ?? {
        documentId: sourceDocumentId,
        documentName: sourceFilename,
        locations: [],
        excerpts: [],
      };

      const location =
        typeof source.page === "number"
          ? locale === "en"
            ? `page ${source.page}`
            : `halaman ${source.page}`
          : typeof source.chunk === "number"
            ? locale === "en"
              ? `section ${source.chunk + 1}`
              : `bagian ${source.chunk + 1}`
            : null;

      if (location && !current.locations.includes(location))
        current.locations.push(location);
      const excerpt =
        typeof source.quote === "string"
          ? source.quote
          : typeof source.content === "string"
            ? source.content
            : null;

      if (excerpt && !current.excerpts.includes(excerpt))
        current.excerpts.push(excerpt);
      grouped.set(sourceDocumentId, current);
    }
  }

  return [...grouped.values()];
}

export type TimelineEntry =
  | { type: "day"; key: string; dayKey: string; label: string }
  | { type: "message"; key: string; message: ConversationMessage }
  | { type: "run"; key: string; run: AssistantRun };

/**
 * Messages and message-less runs (pending or failed answers) in time order,
 * each calendar day in the user's time zone opened by a label entry.
 */
export function buildTimeline(
  messages: ConversationMessage[],
  assistantRuns: AssistantRun[],
  timezone: string,
  locale: SupportedLocale,
  now: Date = new Date()
): { entries: TimelineEntry[]; lastDayKey: string } {
  const items: ({ timestamp: string } & (
    | { type: "message"; message: ConversationMessage }
    | { type: "run"; run: AssistantRun }
  ))[] = messages.map((message) => ({
    type: "message",
    message,
    timestamp: message.createdAt,
  }));

  for (const run of assistantRuns)
    if (!run.assistantMessageId)
      items.push({ type: "run", run, timestamp: run.createdAt });

  items.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  const entries: TimelineEntry[] = [];
  let currentDayKey = "";

  for (const item of items) {
    const dayKey = dayKeyInZone(item.timestamp, timezone);

    if (dayKey && dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      entries.push({
        type: "day",
        key: `day-${dayKey}`,
        dayKey,
        label: formatConversationDay(item.timestamp, timezone, locale, now),
      });
    }

    entries.push(
      item.type === "message"
        ? { type: "message", key: item.message.id, message: item.message }
        : { type: "run", key: `run-${item.run.id}`, run: item.run }
    );
  }

  return { entries, lastDayKey: currentDayKey };
}

/** Groups invocations by their assistant run. */
export function invocationsByRun(
  invocations: ToolInvocation[]
): Record<string, ToolInvocation[]> {
  const byRunId: Record<string, ToolInvocation[]> = {};

  for (const invocation of invocations) {
    const list = byRunId[invocation.assistantRunId] ?? [];
    list.push(invocation);
    byRunId[invocation.assistantRunId] = list;
  }

  return byRunId;
}
