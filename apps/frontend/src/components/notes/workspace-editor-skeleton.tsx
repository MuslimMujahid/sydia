import { cn } from "@/lib/utils/cn";

type WorkspaceEditorSkeletonProps = {
  presentation?: "workspace" | "drawer";
};

export function WorkspaceEditorSkeleton({
  presentation = "workspace",
}: WorkspaceEditorSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Memuat catatan"
      aria-busy="true"
      className={cn(
        "mx-auto w-full max-w-[824px] px-6 pt-8 pb-10 sm:px-12 sm:pt-11",
        presentation === "drawer" && "!pt-6 sm:!px-10 sm:!pt-8"
      )}
    >
      <span className="sr-only">Memuat catatan…</span>
      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        <div className="h-9 w-3/5 max-w-80 rounded-sm bg-surface-1 sm:h-10" />
        <div className="mt-7 flex h-14 items-center gap-3 overflow-hidden border-b border-ink/8 sm:h-12">
          <div className="h-7 w-20 shrink-0 rounded-sm bg-surface-1" />
          <div className="h-5 w-px shrink-0 bg-ink/8" />
          <div className="size-6 shrink-0 rounded-sm bg-surface-1" />
          <div className="size-6 shrink-0 rounded-sm bg-surface-1" />
          <div className="size-6 shrink-0 rounded-sm bg-surface-1" />
          <div className="h-5 w-px shrink-0 bg-ink/8" />
          <div className="h-6 w-14 shrink-0 rounded-sm bg-surface-1" />
        </div>
        <div className="mt-10 min-h-72 space-y-8">
          <div className="space-y-3">
            <div className="h-4 w-full rounded-sm bg-surface-1" />
            <div className="h-4 w-11/12 rounded-sm bg-surface-1" />
            <div className="h-4 w-2/3 rounded-sm bg-surface-1" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-5/6 rounded-sm bg-surface-1" />
            <div className="h-4 w-full rounded-sm bg-surface-1" />
            <div className="h-4 w-1/2 rounded-sm bg-surface-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
