import type { AdminOverview } from "@/components/admin/types";
import { formatBytes, formatCount, formatUsd } from "@/components/admin/format";

export function OverviewStats({ overview }: { overview: AdminOverview }) {
  const stats: Array<{ label: string; value: string }> = [
    { label: "Total pengguna", value: formatCount(overview.totalUsers) },
    { label: "Pengguna aktif", value: formatCount(overview.activeUsers) },
    { label: "Diblokir", value: formatCount(overview.bannedUsers) },
    { label: "Sesi aktif", value: formatCount(overview.activeSessions) },
    { label: "Penyimpanan", value: formatBytes(overview.storageBytes) },
  ];

  return (
    <section
      aria-label="Ringkasan pengguna"
      className="rounded-lg border border-ink/6 bg-canvas px-6 py-5 shadow-card"
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[13px] leading-[1.4] text-ink-muted">
              {stat.label}
            </dt>
            <dd className="mt-1 font-mono text-xl leading-none font-medium text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-[13px] leading-[1.4] text-ink-muted">
            Biaya LLM
          </dt>
          <dd className="mt-1 font-mono text-xl leading-none font-medium text-ink">
            {formatUsd(overview.llmCostUsd)}
          </dd>
          {overview.llmCostBreakdown.length > 0 ? (
            <ul
              aria-label="Rincian biaya per model"
              className="mt-2 space-y-0.5"
            >
              {overview.llmCostBreakdown.map((entry) => (
                <li
                  key={entry.model}
                  className="flex items-baseline justify-between gap-3 font-mono text-[11px] leading-[1.5] text-ink-muted"
                >
                  <span className="truncate">{entry.model}</span>
                  <span>{formatUsd(entry.costUsd)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </dl>
    </section>
  );
}
