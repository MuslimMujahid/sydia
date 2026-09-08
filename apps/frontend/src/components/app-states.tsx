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
import { cn } from "@/lib/utils/cn";

export function LoadingState({
  label = "Memuat ruang kerja Anda…",
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
  title = "Terjadi gangguan pada halaman",
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
      <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
        {title}
      </h1>
      <p className="mt-2 text-ink-muted">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {onRetry ? (
          <Button onClick={onRetry}>
            <RotateCcw />
            Coba lagi
          </Button>
        ) : null}
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link to="/" />}
        >
          <ArrowLeft />
          Kembali ke beranda
        </Button>
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  message,
  action,
  className,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-surface-1 py-10", className)}>
      <Inbox className="mb-4 size-6 text-brand-deep" />
      <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
        {title}
      </h2>
      <p className="mt-2 max-w-xl text-ink-muted">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function AppNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-16">
      <section className="max-w-xl border-l border-ink/8 pl-6">
        <p className="font-mono text-[13px] font-medium tracking-widest text-ink-muted uppercase">
          404 / Tidak ditemukan
        </p>
        <h1 className="mt-4 font-display text-[44px] leading-[1.1] font-bold tracking-[-0.03em] text-ink">
          Halaman ini tidak tersedia.
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-ink-muted">
          Kembali ke pusat kendali Sydia untuk melanjutkan dari tempat yang Anda
          kenali.
        </p>
        <Button className="mt-8" nativeButton={false} render={<Link to="/" />}>
          Kembali ke beranda
        </Button>
      </section>
    </main>
  );
}
