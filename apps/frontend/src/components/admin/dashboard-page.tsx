import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, ChevronRight, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AdminDashboard, AdminPeriod } from "./types";
import { formatCount, formatDate, formatUsd } from "./format";
import { OverviewStats } from "./overview-stats";
import { MetricCard } from "./dashboard-widgets";
import {
  DashboardTrends,
  DashboardAdoption,
  DashboardRecentUsers,
} from "./dashboard-sections";
import { percent, formatIdr } from "./dashboard-format";
import { cn } from "@/lib/utils/cn";

type DashboardPageProps = {
  dashboard: AdminDashboard;
  period: AdminPeriod;
  onPeriodChange: (period: AdminPeriod) => void;
  onRefresh: () => void;
  isFetching: boolean;
  refreshError: string | null;
};

export function DashboardPage({
  dashboard: d,
  period,
  onPeriodChange,
  onRefresh,
  isFetching,
  refreshError,
}: DashboardPageProps) {
  const [failuresOpen, setFailuresOpen] = useState(false);
  const labels = d.daily.map((day) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      timeZone: d.timezone,
    }).format(new Date(`${day.date}T12:00:00+07:00`))
  );

  const { metrics: m, attention: a } = d;
  const messages = d.daily.reduce((sum, day) => sum + day.messages, 0);
  const attentionCount =
    Number(a.failedRuns > 0) +
    Number(a.expiringTrials > 0) +
    Number(a.expiringPlus > 0);

  return (
    <div className="space-y-8 sm:space-y-10">
      <header>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">
          Beranda
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Apa yang perlu ditindaklanjuti hari ini, dan bagaimana tren
          pertumbuhan Sydia.
        </p>
      </header>
      <section aria-labelledby="attention-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="attention-title" className="text-lg font-semibold">
            Perlu perhatian
          </h2>
          <span className="font-mono text-xs text-ink-muted">
            {attentionCount
              ? `${attentionCount} perlu tindakan`
              : "Tidak ada yang perlu ditindaklanjuti"}
          </span>
        </div>
        <div className="divide-y divide-ink/6 overflow-hidden rounded-2xl border border-ink/6 bg-canvas">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <span className="rounded-xl bg-red-50 p-2 text-red-600">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">
                Run asisten gagal · 24 jam
              </h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                {a.totalRuns
                  ? `${percent((a.failedRuns / a.totalRuns) * 100)} dari ${formatCount(a.totalRuns)} run selesai`
                  : "Belum ada run selesai dalam 24 jam"}
              </p>
            </div>
            <span className="font-mono text-xl font-medium">
              {formatCount(a.failedRuns)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!a.failedRuns}
              onClick={() => setFailuresOpen(true)}
              aria-label="Lihat detail run asisten gagal"
            >
              <span className="hidden sm:inline">Lihat detail</span>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {(
            [
              {
                title: "Trial berakhir ≤ 7 hari",
                description: `${a.activeExpiringTrials} aktif dalam 30 hari terakhir`,
                count: a.expiringTrials,
                attention: "trial-expiring",
              },
              {
                title: "Sydia Plus berakhir ≤ 7 hari",
                description: "Langganan berbayar yang segera berakhir",
                count: a.expiringPlus,
                attention: "plus-expiring",
              },
            ] as const
          ).map((item) => (
            <Link
              key={item.attention}
              to="/admin/users"
              search={{ attention: item.attention }}
              className="flex items-center gap-3 px-4 py-4 outline-none hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5"
            >
              <span className="rounded-xl bg-orange-50 p-2 text-orange-700">
                <Clock3 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {item.description}
                </p>
              </div>
              <span className="font-mono text-xl font-medium">
                {formatCount(item.count)}
              </span>
              <span className="hidden text-xs font-semibold text-brand sm:inline">
                Lihat pengguna
              </span>
              <ChevronRight className="size-4 text-ink-muted" />
            </Link>
          ))}
        </div>
      </section>
      <OverviewStats overview={d.overview} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Periode dasbor"
            className="flex rounded-xl border border-ink/8 bg-canvas p-1"
          >
            {([7, 30, 90] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === period}
                onClick={() => onPeriodChange(value)}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  value === period
                    ? "bg-ink text-canvas"
                    : "text-ink-muted hover:bg-surface-1"
                )}
              >
                {value} hari
              </button>
            ))}
          </div>
          <Button
            variant="dark-outline"
            size="icon"
            aria-label="Perbarui dasbor"
            disabled={isFetching}
            onClick={onRefresh}
          >
            <RefreshCw
              className={cn(
                "size-4",
                isFetching && "animate-spin motion-reduce:animate-none"
              )}
            />
          </Button>
        </div>
        <p className="font-mono text-[10px] text-ink-muted">
          <time dateTime={d.generatedAt}>
            Diperbarui{" "}
            {new Intl.DateTimeFormat("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: d.timezone,
            }).format(new Date(d.generatedAt))}{" "}
            WIB
          </time>{" "}
          · {formatDate(d.from)} – {formatDate(d.until)}
        </p>
      </div>
      {refreshError && (
        <p role="alert" className="text-sm text-destructive">
          Pembaruan gagal: {refreshError} Data terakhir tetap ditampilkan.
        </p>
      )}
      <section aria-labelledby="metrics-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="metrics-title" className="text-lg font-semibold">
            Metrik utama
          </h2>
          <span className="font-mono text-xs text-ink-muted">
            {period} hari terakhir vs periode sebelumnya
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          <MetricCard
            title="Pengguna baru"
            metric={m.registrations}
            value={formatCount(m.registrations.value)}
            detail={`vs ${formatCount(m.registrations.previous)} periode lalu`}
            labels={labels}
          />
          <MetricCard
            title="Pengguna aktif · 30 hari"
            metric={m.activeUsers}
            value={formatCount(m.activeUsers.value)}
            detail={`≥1 aktivitas bermakna · ${d.overview.totalUsers ? percent((m.activeUsers.value / d.overview.totalUsers) * 100) : "0%"} dari akun`}
            labels={labels}
          />
          <MetricCard
            title="Konversi trial → Plus"
            metric={m.conversion}
            value={m.conversion.trials ? percent(m.conversion.value) : "—"}
            detail={`${m.conversion.converted} dari ${m.conversion.trials} trial yang berakhir membayar pertama kali`}
            labels={labels}
            points
          />
          <MetricCard
            title="Pendapatan"
            metric={m.revenue}
            value={formatIdr(m.revenue.value)}
            detail={`${formatCount(m.revenue.payments)} pembayaran terverifikasi`}
            labels={labels}
          />
          <MetricCard
            title="Biaya LLM"
            metric={m.cost}
            value={formatUsd(m.cost.value)}
            detail={`${formatUsd(messages ? (m.cost.value / messages) * 1000 : 0)} / 1.000 pesan`}
            labels={labels}
            inverse
          />
          <MetricCard
            title="Keberhasilan asisten"
            metric={m.reliability}
            value={a.totalRuns ? percent(m.reliability.value) : "—"}
            detail={`${formatCount(m.reliability.completed)} selesai · ${formatCount(m.reliability.failed)} gagal · 24 jam`}
            labels={labels}
            points
          />
        </div>
      </section>
      <DashboardTrends
        d={d}
        period={period}
        labels={labels}
        messages={messages}
      />
      <DashboardAdoption d={d} period={period} />
      <DashboardRecentUsers d={d} />
      <Dialog open={failuresOpen} onOpenChange={setFailuresOpen}>
        <DialogContent className="max-h-[80dvh] max-w-2xl overflow-auto">
          <DialogTitle>Run asisten gagal · 24 jam</DialogTitle>
          <p className="mt-2 text-sm text-ink-muted">
            {a.failedRuns} run gagal. Menampilkan maksimal 25 kegagalan terbaru.
          </p>
          <ul className="mt-5 divide-y divide-ink/6">
            {d.failures.map((failure) => (
              <li key={failure.id} className="space-y-2 py-4">
                <p className="text-sm font-medium">{failure.model}</p>
                <time
                  dateTime={failure.createdAt}
                  className="text-xs text-ink-muted"
                >
                  {formatDate(failure.createdAt)}
                </time>
                <p className="break-words text-sm text-destructive">
                  {failure.errorMessage ||
                    "Penyedia asisten tidak memberikan rincian kesalahan."}
                </p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
