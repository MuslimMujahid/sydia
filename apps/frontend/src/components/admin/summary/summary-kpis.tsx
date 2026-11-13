import { Sparkline, type SeriesAggregate } from "../analytics/charts";
import { formatIdr } from "../analytics/meta";
import { KpiStrip, type KpiTileProps } from "../analytics/widgets";
import { formatCount, formatUsd } from "../format";
import type { AdminSummary } from "../types";
import { compare, ratio } from "./summary-format";

type SummaryKpisProps = { data: AdminSummary };

function perBucket(values: number[], counts: number[]): number[] {
  return values.map((value, index) => ratio(value, counts[index] ?? 0) ?? 0);
}

function trend(
  values: number[],
  label: string,
  aggregate: SeriesAggregate = "sum"
) {
  return (
    <Sparkline values={values} label={`Tren ${label}`} aggregate={aggregate} />
  );
}

/** The six headline figures of the summary, each against the previous window. */
export function summaryTiles(data: AdminSummary): KpiTileProps[] {
  const { current, previous, series } = data;
  const perMessage = ratio(current.interactiveUsd, current.messages);
  const perMessageBefore = ratio(previous.interactiveUsd, previous.messages);
  const perUser = ratio(current.backgroundUsd, current.activeUsers);
  const perUserBefore = ratio(previous.backgroundUsd, previous.activeUsers);
  const messagesPerUser = ratio(current.messages, current.activeUsers);

  return [
    {
      label: "Pengguna aktif",
      value: formatCount(current.activeUsers),
      delta: compare(
        "usage",
        current.activeUsers,
        previous.activeUsers,
        formatCount
      ),
      detail: `dari ${formatCount(data.totalAccounts)} akun`,
      trend: trend(series.activeUsers, "pengguna aktif", "max"),
    },
    {
      label: "Pesan pengguna",
      value: formatCount(current.messages),
      delta: compare("usage", current.messages, previous.messages),
      detail:
        messagesPerUser === null
          ? "belum ada pengguna aktif"
          : `${messagesPerUser.toLocaleString("id-ID", { maximumFractionDigits: 1 })} per pengguna aktif`,
      trend: trend(series.messages, "pesan pengguna"),
    },
    {
      label: "Biaya total",
      value: formatUsd(current.costUsd),
      delta: compare("cost", current.costUsd, previous.costUsd),
      detail: `interaktif ${formatUsd(current.interactiveUsd)} · latar ${formatUsd(current.backgroundUsd)}`,
      trend: trend(series.costUsd, "biaya total"),
    },
    {
      label: "Biaya interaktif / pesan",
      value: perMessage === null ? "—" : formatUsd(perMessage),
      delta: compare("cost", perMessage, perMessageBefore),
      detail: "balasan + routing",
      trend: trend(
        perBucket(series.interactiveUsd, series.messages),
        "biaya interaktif per pesan",
        "mean"
      ),
    },
    {
      label: "Biaya latar / pengguna aktif",
      value: perUser === null ? "—" : formatUsd(perUser),
      delta: compare("cost", perUser, perUserBefore),
      detail: "memori, catatan, dokumen",
      trend: trend(
        perBucket(series.backgroundUsd, series.activeUsers),
        "biaya latar per pengguna aktif",
        "mean"
      ),
    },
    {
      label: "Pendapatan",
      value: formatIdr(current.revenueIdr),
      delta: compare(
        "revenue",
        current.revenueIdr,
        previous.revenueIdr,
        formatIdr
      ),
      detail:
        current.payments > 0
          ? `${formatCount(current.payments)} pembayaran`
          : "belum ada pembayaran",
      trend: trend(series.revenueIdr, "pendapatan"),
    },
  ];
}

export function SummaryKpis({ data }: SummaryKpisProps) {
  return <KpiStrip tiles={summaryTiles(data)} />;
}
