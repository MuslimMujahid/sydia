import {
  AlertTriangle,
  ArrowLeft,
  Inbox,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LoadingState({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-64 items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="space-y-3 text-center">
        <LoaderCircle className="mx-auto size-6 animate-spin text-brand-deep motion-reduce:animate-none" />
        <p className="font-mono text-xs tracking-wider text-ink-muted uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something interrupted the page",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="mx-auto max-w-xl" role="alert">
      <AlertTriangle className="mb-4 size-6 text-destructive" />
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-2 text-ink-muted">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {onRetry ? (
          <Button onClick={onRetry}>
            <RotateCcw />
            Try again
          </Button>
        ) : null}
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link to="/" />}
        >
          <ArrowLeft />
          Return home
        </Button>
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-y border-surface-1 py-10">
      <Inbox className="mb-4 size-6 text-brand-deep" />
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-xl text-ink-muted">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function AppNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-16">
      <section className="max-w-xl border-l-4 border-brand pl-6">
        <p className="font-mono text-xs tracking-widest text-link uppercase">
          404 / Not in the index
        </p>
        <h1 className="mt-4 font-display text-5xl font-extrabold text-ink">
          This page isn’t here.
        </h1>
        <p className="mt-4 text-lg text-ink-muted">
          Return to your Sydia control center and continue from a known place.
        </p>
        <Button className="mt-8" nativeButton={false} render={<Link to="/" />}>
          Return home
        </Button>
      </section>
    </main>
  );
}
