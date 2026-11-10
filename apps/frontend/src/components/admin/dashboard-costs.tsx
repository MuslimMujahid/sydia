import { Link } from "@tanstack/react-router";
import type { AdminCostKind, AdminDashboard, AdminPeriod } from "./types";
import { Panel } from "./dashboard-widgets";
import {
  COST_KINDS,
  ORANGE,
  PINK,
  PURPLE,
  percent,
  periodLabel,
} from "./dashboard-format";
import { formatCount, formatUsd } from "./format";

const KIND_COLORS: Record<AdminCostKind, string> = {
  message: PINK,
  background: PURPLE,
  hindsight: ORANGE,
  other: "#918895",
};

const STAGES: Record<string, string> = {
  "assistant.reply": "Balasan asisten",
  "assistant.background": "Evaluasi sekretaris",
  "conversation-summary": "Ringkasan percakapan",
  "memory-dream.extract": "Ekstraksi memori",
  "memory-dream.reconcile": "Rekonsiliasi memori",
  "memory-policy.evidence": "Kebijakan memori",
  "note-agent.background": "Agen catatan",
  "note-clarification": "Klarifikasi catatan",
  "briefing.compose": "Ringkasan harian",
  "document.title": "Nama dokumen",
  "media.transcription": "Transkripsi suara",
  "media.vision": "Membaca gambar",
  embedding: "Embedding",
  hindsight: "Hindsight",
  generation: "Panggilan tanpa label",
};

const JOBS: Record<string, string> = {
  "conversation-summaries": "Ringkasan",
  "memory-dreams": "Memori",
  documents: "Dokumen",
  "note-organizations": "Catatan",
  "daily-note-indexes": "Indeks catatan",
  briefings: "Briefing",
  "follow-ups": "Tindak lanjut",
  secretary: "Sekretaris",
  reminders: "Pengingat",
  "calendar-reminders": "Pengingat kalender",
  "calendar-sync": "Sinkron kalender",
};

/** A readable name for a ledger stage such as `decision.turn` or `note-organization.source`. */
export function stageLabel(stage: string): string {
  if (STAGES[stage]) return STAGES[stage];
  if (stage.startsWith("decision.")) return `Keputusan · ${stage.slice(9)}`;
  if (stage.startsWith("note-organization."))
    return `Pengaturan catatan · ${stage.slice(18)}`;

  return stage;
}

type DashboardCostsProps = {
  d: AdminDashboard;
  period: AdminPeriod;
  messages: number;
};

export function DashboardCosts({ d, period, messages }: DashboardCostsProps) {
  const { costs } = d;
  const total = costs.byKind.reduce((sum, entry) => sum + entry.costUsd, 0);

  return (
    <section aria-labelledby="costs-title">
      <h2 id="costs-title" className="mb-4 text-lg font-semibold">
        Biaya model{" "}
        <span className="ml-2 font-mono text-xs font-normal text-ink-muted">
          {periodLabel(period)}
        </span>
      </h2>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Untuk apa biaya dipakai"
          description="Semua panggilan model, termasuk percobaan gagal dan ulang"
        >
          {costs.byKind.length ? (
            <div className="space-y-5">
              {costs.byKind.map((entry) => (
                <div key={entry.kind}>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span>{COST_KINDS[entry.kind]}</span>
                    <span className="font-mono text-ink-muted">
                      {formatUsd(entry.costUsd)} ·{" "}
                      {percent((entry.costUsd / Math.max(total, 1e-9)) * 100)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${total > 0 ? (entry.costUsd / total) * 100 : 0}%`,
                        backgroundColor: KIND_COLORS[entry.kind],
                      }}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-ink-muted">
                    {formatCount(entry.calls)} panggilan
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              Belum ada panggilan model pada periode ini.
            </p>
          )}
          <ul className="mt-5 space-y-2 border-t border-ink/6 pt-4 text-[11px] leading-relaxed text-ink-muted">
            <li>
              Per pesan pengguna:{" "}
              <strong className="font-mono text-ink">
                {messages ? formatUsd(total / messages) : "—"}
              </strong>{" "}
              (semua biaya ÷ {formatCount(messages)} pesan)
            </li>
            {costs.failedUsd > 0 && (
              <li>
                {formatUsd(costs.failedUsd)} dari percobaan yang gagal, sudah
                termasuk di total.
              </li>
            )}
            {!costs.hindsightTracked && (
              <li className="text-orange-700">
                Biaya Hindsight belum dilacak. Beri Hindsight kunci OpenRouter
                sendiri dan isi BACKEND_HINDSIGHT_OPENROUTER_API_KEY.
              </li>
            )}
          </ul>
        </Panel>
        <Panel
          title="Rincian proses"
          description="Proses termahal; proses latar dikelompokkan per tugas"
        >
          {costs.breakdown.length ? (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  Biaya model per proses, {periodLabel(period)}
                </caption>
                <thead className="text-ink-muted">
                  <tr>
                    <th className="pb-2 font-medium">Proses</th>
                    <th className="pb-2 text-right font-medium">Panggilan</th>
                    <th className="pb-2 text-right font-medium">Biaya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/6">
                  {costs.breakdown.slice(0, 15).map((row) => (
                    <tr key={`${row.kind}:${row.job ?? ""}:${row.stage}`}>
                      <th className="py-2 pr-2 font-normal">
                        <span className="block">{stageLabel(row.stage)}</span>
                        <span className="font-mono text-[10px] text-ink-muted">
                          {COST_KINDS[row.kind]}
                          {row.job && ` · ${JOBS[row.job] ?? row.job}`}
                          {row.failedCalls > 0 &&
                            ` · ${formatCount(row.failedCalls)} gagal`}
                        </span>
                      </th>
                      <td className="py-2 text-right font-mono">
                        {formatCount(row.calls)}
                      </td>
                      <td className="py-2 pl-2 text-right font-mono">
                        {formatUsd(row.costUsd)}
                        {row.unpricedCalls > 0 && (
                          <span
                            className="text-orange-700"
                            title={`${row.unpricedCalls} panggilan tanpa biaya lengkap`}
                          >
                            {" "}
                            *
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">Belum ada rincian.</p>
          )}
        </Panel>
        <Panel
          title="Akun dengan biaya tertinggi"
          description="Semua biaya yang tercatat untuk akun, termasuk proses latar"
        >
          {costs.topAccounts.length ? (
            <ol className="space-y-3">
              {costs.topAccounts.map((account) => (
                <li key={account.userId}>
                  <Link
                    to="/admin/users"
                    search={{ q: account.email }}
                    className="flex items-center gap-3 rounded-lg outline-none hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {account.name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {formatCount(account.messages)} pesan ·{" "}
                        {account.messages
                          ? `${formatUsd(account.costUsd / account.messages)}/pesan`
                          : "tanpa pesan"}
                      </span>
                    </span>
                    <strong className="font-mono text-sm">
                      {formatUsd(account.costUsd)}
                    </strong>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-muted">
              Belum ada biaya per akun pada periode ini.
            </p>
          )}
          {costs.unattributedUsd > 0 && (
            <p className="mt-4 border-t border-ink/6 pt-4 text-[11px] text-ink-muted">
              Tanpa akun (proses sistem dan akun terhapus):{" "}
              <strong className="font-mono text-ink">
                {formatUsd(costs.unattributedUsd)}
              </strong>
            </p>
          )}
        </Panel>
      </div>
    </section>
  );
}
