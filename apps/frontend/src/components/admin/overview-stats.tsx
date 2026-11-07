import type { AdminOverview } from "@/components/admin/types";
import { formatBytes, formatCount, formatUsd } from "@/components/admin/format";
import { cn } from "@/lib/utils/cn";

export function OverviewStats({ overview }: { overview: AdminOverview }) {
  const stats: Array<{ label: string; value: string }> = [
    { label: "Total akun", value: formatCount(overview.totalUsers) },
    { label: "Aktif · 30 hari", value: formatCount(overview.activeUsers) },
    { label: "Berlangganan", value: formatCount(overview.subscribedUsers) },
    {
      label: "Sesi belum kedaluwarsa",
      value: formatCount(overview.activeSessions),
    },
    { label: "Penyimpanan", value: formatBytes(overview.storageBytes) },
    {
      label: "Biaya LLM total",
      value: formatUsd(overview.llmCostUsd).replace("US$", "US$ "),
    },
  ];

  return (
    <section aria-label="Ringkasan pengguna" className="py-1">
      <dl className="grid grid-cols-2 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat, index) => (
          <div key={stat.label} className="relative px-4">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1 left-0 h-8 w-px bg-ink/8 xl:block",
                  index % 2 === 0 ? "hidden" : "block",
                  index % 3 === 0 ? "sm:hidden" : "sm:block"
                )}
              />
            )}
            <dt className="max-w-24 text-[11px] leading-[1.4] text-ink-muted">
              {stat.label}
            </dt>
            <dd className="mt-1 font-mono text-sm leading-5 font-medium whitespace-nowrap text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
