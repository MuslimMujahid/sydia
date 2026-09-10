import { AlertTriangle, FileText, LoaderCircle, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type {
  AssistantActivity,
  AssistantRun,
  ConversationMessage,
  ToolInvocation,
} from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { AssistantMarkdown } from "./assistant-markdown";
import { ChatActionCards } from "./action-cards";

type ProductionToolName =
  | "get_current_datetime"
  | "create_task"
  | "update_task"
  | "list_tasks"
  | "create_reminder"
  | "update_reminder"
  | "save_memory"
  | "update_memory"
  | "forget_memory"
  | "search_memories"
  | "list_categories"
  | "create_category"
  | "update_category"
  | "delete_category"
  | "store_secret"
  | "create_secret_reveal_link"
  | "save_contact"
  | "resolve_contact"
  | "list_documents"
  | "read_document"
  | "save_attached_files"
  | "search_documents"
  | "list_calendar_events"
  | "create_calendar_event"
  | "update_calendar_event"
  | "cancel_calendar_event";

const TOOL_LABELS: Record<ProductionToolName, { en: string; id: string }> = {
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

function toolLabel(
  invocation: ToolInvocation,
  locale: SupportedLocale
): string {
  const labels = TOOL_LABELS[invocation.name as ProductionToolName];

  return labels?.[locale] ?? invocation.label;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DocumentSource = {
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

function documentSources(
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
        typeof source?.documentId === "string" ? source.documentId : documentId;

      const sourceFilename =
        typeof source?.filename === "string" ? source.filename : filename;

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

type TimelineEntry =
  | { type: "message"; timestamp: string; message: ConversationMessage }
  | { type: "run"; timestamp: string; run: AssistantRun };

function currentActivity(
  run: AssistantRun,
  toolInvocations: ToolInvocation[],
  locale: SupportedLocale
): AssistantActivity {
  const latestTool = toolInvocations.at(-1);
  const copy =
    locale === "en"
      ? {
          confirmation: "Your approval is needed to continue",
          queued: "Waiting for its turn…",
          preparing: "Sydia is preparing an answer…",
          executing: "Sydia is",
        }
      : {
          confirmation: "Butuh persetujuan Anda untuk melanjutkan",
          queued: "Menunggu giliran…",
          preparing: "Sydia sedang menyiapkan jawaban…",
          executing: "Sydia sedang",
        };

  if (latestTool?.status === "awaiting_confirmation") {
    return { phase: "awaiting_confirmation", label: copy.confirmation };
  }

  if (
    latestTool &&
    (latestTool.status === "pending" || latestTool.status === "running")
  ) {
    const label = toolLabel(latestTool, locale);

    return {
      phase: "executing_tool",
      label:
        locale === "en"
          ? `${copy.executing} ${label.toLocaleLowerCase("en-US")}…`
          : `${copy.executing} ${label.toLocaleLowerCase("id-ID")}…`,
    };
  }

  return run.status === "queued"
    ? { phase: "queued", label: copy.queued }
    : { phase: "preparing", label: copy.preparing };
}

function FailedRun({
  run,
  isRetrying,
  retryErrorMessage,
  onRetry,
  locale,
}: {
  run: AssistantRun;
  isRetrying: boolean;
  retryErrorMessage?: string;
  onRetry: (runId: string) => void;
  locale: SupportedLocale;
}) {
  const copy =
    locale === "en"
      ? {
          title: "The answer could not be created",
          body: "Your message was saved. Try the answer again without sending the same message.",
          retrying: "Trying again…",
          retry: "Try the answer again",
        }
      : {
          title: "Jawaban belum berhasil dibuat",
          body: "Pesan Anda sudah tersimpan. Coba ulangi jawaban tanpa mengirim pesan yang sama lagi.",
          retrying: "Mencoba lagi…",
          retry: "Coba jawaban lagi",
        };

  return (
    <div className="max-w-xl border-y border-destructive/30 py-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-display font-bold text-ink">{copy.title}</p>
          <p className="mt-1 text-sm text-ink-muted">{copy.body}</p>
          {retryErrorMessage ? (
            <p className="mt-2 text-sm text-destructive">{retryErrorMessage}</p>
          ) : null}
          <Button
            variant="dark-outline"
            size="sm"
            className="mt-4"
            disabled={isRetrying}
            onClick={() => onRetry(run.id)}
          >
            {isRetrying ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            ) : (
              <RotateCcw />
            )}
            {isRetrying ? copy.retrying : copy.retry}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PendingAssistant({
  activity,
  streamedText,
  locale,
}: {
  activity?: AssistantActivity;
  streamedText?: string;
  locale: SupportedLocale;
}) {
  return (
    <article
      className="max-w-xl"
      aria-label={locale === "en" ? "Sydia answer" : "Jawaban Sydia"}
    >
      {streamedText ? (
        <AssistantMarkdown content={streamedText} />
      ) : (
        <div
          className="flex items-center gap-2 text-sm text-ink-muted"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
          <span>
            {activity?.label ??
              (locale === "en"
                ? "Sydia is preparing an answer…"
                : "Sydia sedang menyiapkan jawaban…")}
          </span>
        </div>
      )}
    </article>
  );
}

export function MessageHistory({
  messages,
  assistantRuns,
  toolInvocations,
  optimisticMessage,
  isSending,
  streamedActivity,
  streamedText,
  retryErrorRunId,
  retryingRunId,
  retryErrorMessage,
  onRetry,
  locale,
}: {
  messages: ConversationMessage[];
  assistantRuns: AssistantRun[];
  toolInvocations: ToolInvocation[];
  optimisticMessage?: { content: string; attachmentCount?: number };
  isSending: boolean;
  streamedActivity?: AssistantActivity;
  streamedText?: string;
  retryingRunId?: string;
  retryErrorRunId?: string;
  retryErrorMessage?: string;
  onRetry: (runId: string) => void;
  locale: SupportedLocale;
}) {
  const runsByMessageId = useMemo(() => {
    const byMessageId: Record<string, AssistantRun> = {};

    for (const run of assistantRuns) {
      if (run.assistantMessageId) byMessageId[run.assistantMessageId] = run;
    }

    return byMessageId;
  }, [assistantRuns]);

  const toolsByRunId = useMemo(() => {
    const byRunId: Record<string, ToolInvocation[]> = {};

    for (const invocation of toolInvocations) {
      const runInvocations = byRunId[invocation.assistantRunId] ?? [];
      runInvocations.push(invocation);
      byRunId[invocation.assistantRunId] = runInvocations;
    }

    return byRunId;
  }, [toolInvocations]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = messages.map((message) => ({
      type: "message",
      message,
      timestamp: message.createdAt,
    }));

    for (const run of assistantRuns) {
      if (!run.assistantMessageId) {
        entries.push({ type: "run", run, timestamp: run.createdAt });
      }
    }

    return entries.sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
    );
  }, [assistantRuns, messages]);

  const hasActiveRun = assistantRuns.some(
    (run) => run.status === "queued" || run.status === "running"
  );

  return (
    <ol className="mx-auto max-w-3xl space-y-12 px-4 py-8 sm:px-6 sm:py-10">
      {timeline.map((entry) => {
        if (entry.type === "run") {
          if (entry.run.status === "failed") {
            return (
              <li key={`run-${entry.run.id}`}>
                <FailedRun
                  run={entry.run}
                  isRetrying={retryingRunId === entry.run.id}
                  retryErrorMessage={
                    retryErrorRunId === entry.run.id
                      ? retryErrorMessage
                      : undefined
                  }
                  onRetry={onRetry}
                  locale={locale}
                />
              </li>
            );
          }

          if (entry.run.status === "queued" || entry.run.status === "running") {
            const activity =
              streamedActivity ??
              currentActivity(
                entry.run,
                toolsByRunId[entry.run.id] ?? [],
                locale
              );

            return (
              <li key={`run-${entry.run.id}`}>
                <PendingAssistant
                  activity={activity}
                  streamedText={streamedText}
                  locale={locale}
                />
              </li>
            );
          }

          return null;
        }

        const { message } = entry;
        const run = runsByMessageId[message.id];
        const isUser = message.role === "user";
        const provenance = run
          ? documentSources(toolsByRunId[run.id] ?? [], locale)
          : [];

        return (
          <li
            key={message.id}
            className={isUser ? "flex justify-end" : undefined}
          >
            <article
              aria-label={
                isUser
                  ? locale === "en"
                    ? "Your message"
                    : "Pesan Anda"
                  : locale === "en"
                    ? "Sydia answer"
                    : "Jawaban Sydia"
              }
              className={
                isUser
                  ? "max-w-[85%] rounded-md bg-surface-1 px-4 py-3 text-ink sm:max-w-[75%]"
                  : "max-w-xl"
              }
            >
              {isUser ? (
                <>
                  <p className="break-words whitespace-pre-wrap text-base leading-6 text-ink-soft">
                    {message.content}
                  </p>
                  {message.attachments.length ? (
                    <ul
                      aria-label={
                        locale === "en" ? "Attached files" : "File lampiran"
                      }
                      className="mt-3 space-y-2 border-t border-ink/10 pt-3"
                    >
                      {message.attachments.map(({ fileAsset }) => (
                        <li
                          key={fileAsset.id}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <FileText className="size-4 shrink-0 text-ink-muted" />
                          <span
                            className="min-w-0 flex-1 truncate text-sm font-medium text-ink"
                            title={fileAsset.originalName}
                          >
                            {fileAsset.originalName}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-ink-muted">
                            {formatFileSize(fileAsset.size)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <AssistantMarkdown content={message.content} />
              )}
              {!isUser && provenance.length ? (
                <aside
                  aria-label={
                    locale === "en" ? "Answer sources" : "Sumber jawaban"
                  }
                  className="mt-5 border-t border-surface-1 pt-4"
                >
                  <p className="font-display text-sm font-bold text-ink">
                    {locale === "en" ? "Sources" : "Sumber"}
                  </p>
                  <ul className="mt-2 space-y-2 text-sm text-ink-muted">
                    {provenance.map((source) => (
                      <li
                        key={source.documentId}
                        className="flex items-start gap-2"
                      >
                        <FileText className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                        <span>
                          <span className="font-medium text-ink-soft">
                            {source.documentName}
                            {source.locations.length
                              ? ` · ${source.locations.join(", ")}`
                              : ""}
                          </span>
                          {source.excerpts[0] ? (
                            <span className="mt-0.5 block line-clamp-2">
                              {source.excerpts[0]}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
              {!isUser && run ? (
                <ChatActionCards
                  invocations={toolsByRunId[run.id] ?? []}
                  locale={locale}
                />
              ) : null}
            </article>
          </li>
        );
      })}

      {optimisticMessage ? (
        <li className="flex justify-end">
          <article
            aria-label={
              locale === "en"
                ? "Your message is being sent"
                : "Pesan Anda sedang dikirim"
            }
            className="max-w-[85%] rounded-md bg-surface-1 px-4 py-3 text-ink opacity-70 sm:max-w-[75%]"
          >
            <p className="break-words whitespace-pre-wrap text-base leading-6 text-ink-soft">
              {optimisticMessage.content}
            </p>
            {optimisticMessage.attachmentCount ? (
              <p className="mt-2 flex items-center justify-end gap-1.5 text-sm text-ink-muted">
                <FileText className="size-4" />
                {optimisticMessage.attachmentCount}{" "}
                {locale === "en" ? "attachments" : "lampiran"}
              </p>
            ) : null}
          </article>
        </li>
      ) : null}

      {isSending && !hasActiveRun ? (
        <li>
          <PendingAssistant
            activity={streamedActivity}
            streamedText={streamedText}
            locale={locale}
          />
        </li>
      ) : null}
    </ol>
  );
}
