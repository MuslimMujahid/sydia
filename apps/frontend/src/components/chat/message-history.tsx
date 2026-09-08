import { AlertTriangle, FileText, LoaderCircle, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import type {
  AssistantRun,
  ConversationMessage,
  ToolInvocation,
} from "@/lib/services/api/conversations/conversations.api";
import { AssistantActivity } from "./assistant-activity";
import { AssistantMarkdown } from "./assistant-markdown";
import { ChatActionCards } from "./action-cards";

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
    if (invocation.name !== "search_documents") continue;
    const output = asRecord(invocation.output);
    if (!Array.isArray(output?.sources)) continue;

    for (const value of output.sources) {
      const source = asRecord(value);
      if (
        typeof source?.documentId !== "string" ||
        typeof source.filename !== "string"
      )
        continue;
      const current = grouped.get(source.documentId) ?? {
        documentId: source.documentId,
        documentName: source.filename,
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
      if (
        typeof source.quote === "string" &&
        !current.excerpts.includes(source.quote)
      )
        current.excerpts.push(source.quote);
      grouped.set(source.documentId, current);
    }
  }

  return [...grouped.values()];
}

type TimelineEntry =
  | { type: "message"; timestamp: string; message: ConversationMessage }
  | { type: "run"; timestamp: string; run: AssistantRun };

function FailedRun({
  run,
  toolInvocations,
  isRetrying,
  retryErrorMessage,
  onRetry,
}: {
  run: AssistantRun;
  toolInvocations: ToolInvocation[];
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
      <AssistantActivity run={run} toolInvocations={toolInvocations} />
    </div>
  );
}

function PendingAssistant({
  run,
  toolInvocations,
}: {
  run?: AssistantRun;
  toolInvocations: ToolInvocation[];
}) {
  return (
    <div className="max-w-xl" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-ink-muted">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-canvas ring-1 ring-surface-1">
          <SydiaLogo className="h-4" />
        </span>
        <span className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          Sydia sedang menyiapkan jawaban…
        </span>
      </div>
      {run ? (
        <AssistantActivity run={run} toolInvocations={toolInvocations} />
      ) : null}
    </div>
  );
}

export function MessageHistory({
  messages,
  assistantRuns,
  toolInvocations,
  optimisticMessage,
  isSending,
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

  return (
    <ol className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      {timeline.map((entry) => {
        if (entry.type === "run") {
          if (entry.run.status === "failed") {
            return (
              <li key={`run-${entry.run.id}`}>
                <FailedRun
                  run={entry.run}
                  toolInvocations={toolsByRunId[entry.run.id] ?? []}
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
            return (
              <li key={`run-${entry.run.id}`}>
                <PendingAssistant
                  run={entry.run}
                  toolInvocations={toolsByRunId[entry.run.id] ?? []}
                />
              </li>
            );
          }

          return null;
        }

        const { message } = entry;
        const run = runsByMessageId[message.id];
        const isUser = message.role === "user";
        const time = formatMessageTime(message.createdAt);
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
              <div
                className={
                  isUser
                    ? "mb-1 flex justify-end gap-2"
                    : "mb-3 flex items-center gap-3"
                }
              >
                {!isUser ? (
                  <span className="grid size-8 place-items-center rounded-full bg-canvas ring-1 ring-surface-1">
                    <SydiaLogo className="h-4" />
                  </span>
                ) : null}
                <span className="font-display text-sm font-bold">
                  {isUser ? "Anda" : "Sydia"}
                </span>
                {time ? (
                  <time
                    dateTime={message.createdAt}
                    className="font-mono text-xs font-normal text-ink-muted"
                  >
                    {time}
                  </time>
                ) : null}
              </div>
              {isUser ? (
                <p className="break-words whitespace-pre-wrap text-base leading-6 text-ink-soft">
                  {message.content}
                </p>
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
              {!isUser && run ? (
                <AssistantActivity
                  run={run}
                  toolInvocations={toolsByRunId[run.id] ?? []}
                />
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
            <div className="mb-1 flex justify-end gap-2">
              <span className="font-display text-sm font-bold">Anda</span>
              <span className="flex items-center gap-1 font-mono text-xs text-ink-muted">
                <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
                Mengirim
              </span>
            </div>
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

      {isSending ? (
        <li>
          <PendingAssistant toolInvocations={[]} />
        </li>
      ) : null}
    </ol>
  );
}
