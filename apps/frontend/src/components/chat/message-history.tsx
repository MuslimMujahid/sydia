import { AlertTriangle, FileText, LoaderCircle, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type {
  AssistantActivity,
  AssistantRun,
  ConversationMessage,
  ToolInvocation,
} from "@/lib/services/api/conversations/conversations.api";
import { AssistantMarkdown } from "./assistant-markdown";
import { ChatActionCards } from "./action-cards";

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

function documentSources(invocations: ToolInvocation[]): DocumentSource[] {
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
          ? `halaman ${source.page}`
          : typeof source.chunk === "number"
            ? `bagian ${source.chunk + 1}`
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
  toolInvocations: ToolInvocation[]
): AssistantActivity {
  const latestTool = toolInvocations.at(-1);

  if (latestTool?.status === "awaiting_confirmation") {
    return {
      phase: "awaiting_confirmation",
      label: "Butuh persetujuan Anda untuk melanjutkan",
    };
  }

  if (
    latestTool &&
    (latestTool.status === "pending" || latestTool.status === "running")
  ) {
    return {
      phase: "executing_tool",
      label: `Sydia sedang ${latestTool.label.toLocaleLowerCase("id-ID")}…`,
    };
  }

  return run.status === "queued"
    ? { phase: "queued", label: "Menunggu giliran…" }
    : {
        phase: "preparing",
        label: "Sydia sedang menyiapkan jawaban…",
      };
}

function FailedRun({
  run,
  isRetrying,
  retryErrorMessage,
  onRetry,
}: {
  run: AssistantRun;
  isRetrying: boolean;
  retryErrorMessage?: string;
  onRetry: (runId: string) => void;
}) {
  return (
    <div className="max-w-xl border-y border-destructive/30 py-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-display font-bold text-ink">
            Jawaban belum berhasil dibuat
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Pesan Anda sudah tersimpan. Coba ulangi jawaban tanpa mengirim pesan
            yang sama lagi.
          </p>
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
            {isRetrying ? "Mencoba lagi…" : "Coba jawaban lagi"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PendingAssistant({
  activity,
  streamedText,
}: {
  activity?: AssistantActivity;
  streamedText?: string;
}) {
  return (
    <article className="max-w-xl" aria-label="Jawaban Sydia">
      {streamedText ? (
        <AssistantMarkdown content={streamedText} />
      ) : (
        <div
          className="flex items-center gap-2 text-sm text-ink-muted"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
          <span>{activity?.label ?? "Sydia sedang menyiapkan jawaban…"}</span>
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
                />
              </li>
            );
          }

          if (entry.run.status === "queued" || entry.run.status === "running") {
            const activity =
              streamedActivity ??
              currentActivity(entry.run, toolsByRunId[entry.run.id] ?? []);

            return (
              <li key={`run-${entry.run.id}`}>
                <PendingAssistant
                  activity={activity}
                  streamedText={streamedText}
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
          ? documentSources(toolsByRunId[run.id] ?? [])
          : [];

        return (
          <li
            key={message.id}
            className={isUser ? "flex justify-end" : undefined}
          >
            <article
              aria-label={isUser ? "Pesan Anda" : "Jawaban Sydia"}
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
                      aria-label="File lampiran"
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
                  aria-label="Sumber jawaban"
                  className="mt-5 border-t border-surface-1 pt-4"
                >
                  <p className="font-display text-sm font-bold text-ink">
                    Sumber
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
                <ChatActionCards invocations={toolsByRunId[run.id] ?? []} />
              ) : null}
            </article>
          </li>
        );
      })}

      {optimisticMessage ? (
        <li className="flex justify-end">
          <article
            aria-label="Pesan Anda sedang dikirim"
            className="max-w-[85%] rounded-md bg-surface-1 px-4 py-3 text-ink opacity-70 sm:max-w-[75%]"
          >
            <p className="break-words whitespace-pre-wrap text-base leading-6 text-ink-soft">
              {optimisticMessage.content}
            </p>
            {optimisticMessage.attachmentCount ? (
              <p className="mt-2 flex items-center justify-end gap-1.5 text-sm text-ink-muted">
                <FileText className="size-4" />
                {optimisticMessage.attachmentCount} lampiran
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
          />
        </li>
      ) : null}
    </ol>
  );
}
