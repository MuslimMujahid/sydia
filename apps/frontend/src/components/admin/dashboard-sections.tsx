import { Link } from "@tanstack/react-router";
import type { AdminDashboard, AdminPeriod } from "./types";
import { AdminChart } from "./admin-chart";
import { Panel } from "./dashboard-widgets";
import { PINK, PURPLE, ORANGE, percent } from "./dashboard-format";
import { formatCount, formatDate, formatUsd } from "./format";

const FEATURES: Record<string, string> = {
  tasks: "Tugas",
  reminders: "Pengingat",
  memories: "Memori",
  documents: "Dokumen",
  calendar: "Kalender",
  contacts: "Kontak",
  notes: "Catatan",
};

const CHANNELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

type SectionProps = { d: AdminDashboard; period: AdminPeriod };

export function DashboardTrends({
  d,
  period,
  labels,
  messages,
}: SectionProps & { labels: string[]; messages: number }) {
  return (
    <section aria-labelledby="trends-title">
      <h2 id="trends-title" className="mb-4 text-lg font-semibold">
        Tren harian{" "}
        <span className="ml-2 font-mono text-xs font-normal text-ink-muted">
          {period} hari
        </span>
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Pendaftaran vs aktivitas harian"
          description="≥1 aktivitas bermakna pada hari itu · skala tiap seri terpisah"
        >
          <AdminChart
            label="Pendaftaran dan pengguna beraktivitas per hari"
            labels={labels}
            series={[
              {
                label: "Beraktivitas",
                values: d.daily.map((x) => x.activeUsers),
                color: PINK,
              },
              {
                label: "Pendaftar",
                values: d.daily.map((x) => x.registrations),
                color: "#918895",
              },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-6 border-t border-ink/6 pt-4 text-xs text-ink-muted">
            <p>
              Rata-rata beraktivitas/hari{" "}
              <strong className="mt-1 block font-mono text-sm text-ink">
                {new Intl.NumberFormat("id-ID", {
                  maximumFractionDigits: 1,
                }).format(
                  d.daily.reduce((sum, x) => sum + x.activeUsers, 0) /
                    Math.max(1, d.daily.length)
                )}
              </strong>
            </p>
            <p>
              Puncak{" "}
              <strong className="mt-1 block font-mono text-sm text-ink">
                {formatCount(Math.max(0, ...d.daily.map((x) => x.activeUsers)))}
              </strong>
            </p>
          </div>
        </Panel>
        <Panel
          title="Pesan vs biaya LLM"
          description="Deteksi lonjakan biaya yang tidak sejalan dengan aktivitas · skala tiap seri terpisah"
        >
          <AdminChart
            label="Pesan dan biaya LLM per hari"
            labels={labels}
            series={[
              {
                label: "Pesan",
                values: d.daily.map((x) => x.messages),
                color: PURPLE,
              },
              {
                label: "Biaya (US$)",
                values: d.daily.map((x) => x.costUsd),
                color: ORANGE,
                format: formatUsd,
              },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-6 border-t border-ink/6 pt-4 text-xs text-ink-muted">
            <p>
              Pesan/hari{" "}
              <strong className="mt-1 block font-mono text-sm text-ink">
                {formatCount(
                  Math.round(messages / Math.max(1, d.daily.length))
                )}
              </strong>
            </p>
            <p>
              Model terbesar{" "}
              <strong className="mt-1 block font-mono text-sm text-ink">
                {d.models.length ? d.models[0]!.model : "Belum ada"}
              </strong>
            </p>
          </div>
        </Panel>
      </div>
    </section>
  );
}

export function DashboardAdoption({ d, period }: SectionProps) {
  const channelTotal = d.channels.reduce(
    (sum, channel) => sum + channel.messages,
    0
  );

  return (
    <section aria-labelledby="adoption-title">
      <h2 id="adoption-title" className="mb-4 text-lg font-semibold">
        Kanal & adopsi
      </h2>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Kanal percakapan"
          description={`Sumber pesan masuk · ${period} hari`}
        >
          <div className="space-y-5">
            {d.channels.length ? (
              d.channels.map((channel, index) => (
                <div key={channel.channel}>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span>{CHANNELS[channel.channel] ?? channel.channel}</span>
                    <span className="font-mono text-ink-muted">
                      {formatCount(channel.messages)} pesan ·{" "}
                      {percent(
                        (channel.messages / Math.max(1, channelTotal)) * 100
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(channel.messages / Math.max(1, channelTotal)) * 100}%`,
                        backgroundColor: [PINK, PURPLE, ORANGE][index % 3],
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-ink-muted">Belum ada pesan masuk.</p>
            )}
          </div>
        </Panel>
        <Panel
          title="Adopsi fitur"
          description="% pengguna aktif yang memakai fitur · 30 hari"
        >
          <div className="space-y-4">
            {Object.entries(FEATURES).map(([feature, label]) => {
              const users =
                d.adoption.find((x) => x.feature === feature)?.users ?? 0;

              const share = (users / Math.max(1, d.overview.activeUsers)) * 100;

              return (
                <div key={feature}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>{label}</span>
                    <span className="font-mono">{percent(share)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-1">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.min(100, share)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel
          title="Sumber akuisisi"
          description="Pendaftar baru berdasarkan utm_source"
        >
          <div className="space-y-5">
            {d.acquisition.length ? (
              d.acquisition.map((source) => (
                <div
                  key={source.source}
                  className="flex justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate">{source.source}</span>
                  <span className="ml-auto whitespace-nowrap font-mono text-ink-muted">
                    {source.converted} → Plus
                  </span>
                  <strong className="font-mono">{source.users}</strong>
                </div>
              ))
            ) : (
              <p className="text-xs text-ink-muted">
                Belum ada pendaftar pada periode ini.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

export function DashboardRecentUsers({ d }: { d: AdminDashboard }) {
  return (
    <section aria-labelledby="recent-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="recent-title" className="text-lg font-semibold">
          Pendaftar terbaru
        </h2>
        <Link to="/admin/users" className="text-xs font-semibold text-brand">
          Lihat semua →
        </Link>
      </div>
      <div className="divide-y divide-ink/6 rounded-2xl border border-ink/6 bg-canvas px-5">
        {d.recentUsers.length ? (
          d.recentUsers.map((user) => (
            <div key={user.id} className="flex items-center gap-3 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                {user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-muted">
                  {!user.onboardingCompleted
                    ? "Onboarding belum selesai"
                    : user.plan === "plus"
                      ? "Sydia Plus"
                      : user.plan === "trial"
                        ? "Trial"
                        : user.plan === "disabled"
                          ? "Belum diberlakukan"
                          : "Trial berakhir"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-ink-muted">
                  {formatDate(user.createdAt)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="py-6 text-sm text-ink-muted">Belum ada pengguna.</p>
        )}
      </div>
    </section>
  );
}
