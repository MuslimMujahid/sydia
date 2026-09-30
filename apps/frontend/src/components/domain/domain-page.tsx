import { AlertTriangle, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { TopbarPortal, TopbarTitle } from "@/components/dashboard/topbar-slots";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type DomainAddAction = {
  /** Button text from `lg`; accessible name and tooltip below it. */
  label: string;
  /** Icon for the labelled button from `lg`. Defaults to a plus. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Show a spinner while the create action runs. */
  pending?: boolean;
  onClick: () => void;
};

export type DomainPageHeaderProps = {
  title: string;
  /** Controls shown in place of the title, including in the mobile app bar. */
  titleAction?: ReactNode;
  /** Secondary header controls. */
  action?: ReactNode;
  /**
   * The page's create action: a labelled header button from `lg`, and an
   * icon-only floating button below it. Pages that set it reserve
   * `pb-20 lg:pb-0` so the floating button does not cover the last row.
   */
  addAction?: DomainAddAction;
  /** Draw the rule under the header from `lg`. */
  divided?: boolean;
};

/**
 * The page title. From `lg` it heads the page; below `lg` it moves into the
 * shell's app bar and only the header's action (if any) stays in the page.
 */
export function DomainPageHeader({
  title,
  titleAction,
  action,
  addAction,
  divided = true,
}: DomainPageHeaderProps) {
  return (
    <>
      {titleAction ? (
        <TopbarPortal slot="title">{titleAction}</TopbarPortal>
      ) : (
        <TopbarTitle>{title}</TopbarTitle>
      )}
      <header
        className={cn(
          "flex items-center justify-between gap-4",
          divided && "lg:border-b lg:border-ink/8 lg:pb-8",
          !action && "max-lg:hidden"
        )}
      >
        {titleAction ? (
          <div className="max-lg:hidden">{titleAction}</div>
        ) : (
          <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] max-lg:hidden">
            {title}
          </h1>
        )}
        {action || addAction ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3 lg:shrink-0">
            {action}
            {addAction ? (
              <Button
                className="max-lg:hidden"
                disabled={addAction.disabled}
                onClick={addAction.onClick}
              >
                {addAction.pending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : (
                  (addAction.icon ?? <Plus />)
                )}
                {addAction.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      {addAction ? <FloatingAddButton {...addAction} /> : null}
    </>
  );
}

/** The create action as an icon-only button in the bottom-right corner on phones. */
function FloatingAddButton({
  label,
  disabled,
  pending,
  onClick,
}: DomainAddAction) {
  return (
    <Button
      aria-label={label}
      title={label}
      disabled={disabled}
      className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 size-14 rounded-pill p-0 shadow-card sm:right-8 sm:bottom-8 lg:hidden"
      onClick={onClick}
    >
      {pending ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-6 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Plus aria-hidden="true" className="size-6" />
      )}
    </Button>
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
