import { AlertTriangle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function DomainPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-ink/8 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
          {title}
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-ink-muted">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function DomainListSkeleton({ label }: { label: string }) {
  return (
    <div
      className="divide-y divide-surface-1 border-y border-surface-1"
      aria-busy="true"
      aria-label={label}
    >
      {["w-2/3", "w-1/2", "w-4/5"].map((width, index) => (
        <div key={index} className="space-y-3 py-6">
          <div
            className={cn(
              "h-5 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none",
              width
            )}
          />
          <div className="h-4 w-40 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function DomainInlineError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="border-y border-destructive/30 py-8" role="alert">
      <AlertTriangle className="size-6 text-destructive" />
      <h2 className="mt-4 font-display text-[17px] leading-[1.6] font-semibold">
        {title}
      </h2>
      <p className="mt-2 max-w-xl text-ink-muted">{message}</p>
      <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
        <RotateCcw />
        Coba lagi
      </Button>
    </div>
  );
}
