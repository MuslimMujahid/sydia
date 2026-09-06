import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  CircleDashed,
  LoaderCircle,
} from "lucide-react";
import type {
  AssistantRun,
  ToolInvocation,
} from "@/lib/services/api/conversations/conversations.api";
import { cn } from "@/lib/utils/cn";

const RUN_LABELS: Record<AssistantRun["status"], string> = {
  queued: "Menunggu giliran",
  running: "Sedang menyiapkan jawaban",
  completed: "Jawaban selesai",
  failed: "Jawaban gagal",
};

const TOOL_LABELS: Record<ToolInvocation["status"], string> = {
  pending: "Menunggu",
  running: "Sedang berjalan",
  awaiting_confirmation: "Menunggu persetujuan",
  completed: "Selesai",
  failed: "Gagal",
  rejected: "Tidak dijalankan",
};

function StatusIcon({ status }: { status: ToolInvocation["status"] }) {
  if (status === "completed") return <Check className="size-3.5" />;
  if (status === "failed") return <AlertTriangle className="size-3.5" />;
  if (status === "rejected") return <Ban className="size-3.5" />;

  if (status === "running") {
    return (
      <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
    );
  }

  return <CircleDashed className="size-3.5" />;
}

export function AssistantActivity({
  run,
  toolInvocations,
}: {
  run: AssistantRun;
  toolInvocations: ToolInvocation[];
}) {
  const isActive = run.status === "queued" || run.status === "running";
  const completedTools = toolInvocations.filter(
    (tool) => tool.status === "completed"
  ).length;

  const summary =
    toolInvocations.length > 0
      ? `${completedTools} dari ${toolInvocations.length} aktivitas selesai`
      : RUN_LABELS[run.status];

  return (
    <details className="group mt-3 max-w-xl text-sm text-ink-muted">
      <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-2 rounded-sm pr-2 outline-none transition-colors hover:text-ink focus-visible:ring-3 focus-visible:ring-brand/40 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        <span>Aktivitas</span>
        <span aria-hidden="true">·</span>
        <span aria-live={isActive ? "polite" : undefined}>{summary}</span>
      </summary>
      <div className="ml-2 border-l border-hairline py-2 pl-5">
        <p
          className={cn(
            "flex items-center gap-2",
            run.status === "failed" && "text-destructive"
          )}
        >
          {isActive ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : run.status === "failed" ? (
            <AlertTriangle className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
          {RUN_LABELS[run.status]}
        </p>
        {toolInvocations.length > 0 ? (
          <ul className="mt-3 space-y-2" aria-label="Rincian aktivitas">
            {toolInvocations.map((tool) => (
              <li key={tool.id} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 text-ink-weak",
                    tool.status === "failed" && "text-destructive"
                  )}
                >
                  <StatusIcon status={tool.status} />
                </span>
                <span>
                  <span className="text-ink-soft">{tool.label}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{TOOL_LABELS[tool.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">Tidak ada tindakan tambahan pada jawaban ini.</p>
        )}
      </div>
    </details>
  );
}
