import {
  BarChart,
  ChartLegend,
  ChartTable,
  type ChartSeries,
} from "../analytics/charts";
import {
  chartUnit,
  COST_CATEGORIES,
  bucketLabels,
  groupCosts,
  sum,
} from "../analytics/meta";
import { Card, SectionHeader } from "../analytics/widgets";
import { formatCount, formatUsd } from "../format";
import type { AdminSummary } from "../types";

type SummaryTrendsProps = { data: AdminSummary };

const MESSAGE_COLOR = "#e0457b";
/** Above this many buckets the per-bucket active-user footer gets unreadable. */
const FOOTER_LIMIT = 14;

const AXIS_USD = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const AXIS_SMALL_USD = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

/** "$0,5": compact enough for a 10px chart axis and tooltip. */
function chartUsd(value: number): string {
  return `$${(Math.abs(value) < 1 ? AXIS_SMALL_USD : AXIS_USD).format(value)}`;
}

function chartCount(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

/**
 * The last bucket that has started by the time the read was generated, when
 * later buckets exist (only "today" can have them).
 */
export function upcomingFrom(data: AdminSummary): number | undefined {
  if (data.period !== "today") return undefined;
  const now = new Date(data.generatedAt).getTime();
  let last = -1;

  data.buckets.forEach((start, index) => {
    if (new Date(start).getTime() <= now) last = index;
  });

  return last >= 0 && last < data.buckets.length - 1 ? last : undefined;
}

function list(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");

  return `${labels.slice(0, -1).join(", ")} dan ${labels[labels.length - 1]}`;
}

/** One sentence that reads the message chart for the viewer. */
export function messagesCaption(
  data: AdminSummary,
  labels: string[]
): string | null {
  const messages = data.series.messages;
  const total = sum(messages);
  if (!total) return null;

  if (data.normal) {
    const lastSeen = upcomingFrom(data) ?? messages.length - 1;
    const busier: string[] = [];
    const quieter: string[] = [];

    messages.forEach((value, index) => {
      const range = data.normal?.[index]?.messages;
      if (!range || index > lastSeen) return;
      if (value > range[1]) busier.push(labels[index] ?? "");
      else if (value < range[0]) quieter.push(labels[index] ?? "");
    });

    const parts = [
      busier.length
        ? `Lebih ramai dari biasa pada ${list(busier.slice(0, 3))}`
        : null,
      quieter.length ? `lebih sepi pada ${list(quieter.slice(0, 3))}` : null,
    ].filter((part): part is string => part !== null);

    return parts.length
      ? parts.join(" · ")
      : "Sesuai rentang normal sepanjang hari";
  }

  const peak = messages.indexOf(Math.max(...messages));
  const unit = data.bucket === "hour" ? "jam" : "hari";
  const average = (total / messages.length).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  });

  return `Rata-rata ${average} pesan/${unit} · puncak ${labels[peak] ?? ""}`;
}

/** "7–13 Nov" for the section meta of daily windows. */
function rangeLabel(data: AdminSummary): string {
  const first = data.buckets[0];
  const last = data.buckets[data.buckets.length - 1];
  if (!first || !last) return "";
  const format = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: data.timezone,
  });

  return `${format.format(new Date(first))} – ${format.format(new Date(last))}`;
}

export function SummaryTrends({ data }: SummaryTrendsProps) {
  const hourly = data.bucket === "hour";
  const unit = chartUnit(data);
  const rowUnit = hourly ? "jam" : "hari";
  const labels = bucketLabels(data);
  const upcoming = upcomingFrom(data);
  const showFooter = !hourly && labels.length <= FOOTER_LIMIT;
  const caption = messagesCaption(data, labels);

  const messageBand = data.normal?.map((entry) => entry.messages) ?? null;
  const costBand = data.normal?.map((entry) => entry.costUsd) ?? null;

  const grouped = data.series.featureCosts.map(groupCosts);
  const costSeries: ChartSeries[] = COST_CATEGORIES.map(
    ({ key, label, color }) => ({
      key,
      label,
      color,
      values: labels.map((_, index) => grouped[index]?.[key] ?? 0),
    })
  );

  return (
    <section aria-labelledby="summary-trends">
      <SectionHeader
        id="summary-trends"
        title={
          hourly
            ? data.period === "today"
              ? "Per jam hari ini"
              : "Per jam"
            : unit === "minggu"
              ? "Tren mingguan"
              : "Tren harian"
        }
        meta={
          data.normal
            ? "area abu = rentang normal 7 hari"
            : hourly
              ? undefined
              : rangeLabel(data)
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={`Pesan pengguna per ${unit}`}
          description={
            data.normal
              ? "Batang = periode ini · area abu = normal (p25–p75, 7 hari)"
              : showFooter
                ? "Baris bawah = pengguna aktif pada hari itu"
                : "Pesan yang dikirim pengguna"
          }
        >
          <BarChart
            label={`Pesan pengguna per ${unit}`}
            labels={labels}
            series={[
              {
                key: "messages",
                label: "Pesan",
                color: MESSAGE_COLOR,
                values: data.series.messages,
              },
            ]}
            band={messageBand}
            upcomingFrom={upcoming}
            format={chartCount}
            footer={
              showFooter
                ? (index) =>
                    `${formatCount(data.series.activeUsers[index] ?? 0)} pgn`
                : undefined
            }
          />
          {upcoming !== undefined && (
            <p className="mt-2 text-[11px] text-ink-muted">
              Kolom berarsir di kanan = jam yang belum terjadi.
            </p>
          )}
          {caption && <p className="mt-3 text-xs text-ink-muted">{caption}</p>}
          <ChartTable
            caption={`Pesan pengguna dan pengguna aktif per ${rowUnit}`}
            columns={[
              hourly ? "Jam" : "Tanggal",
              "Pesan",
              "Pengguna aktif",
              ...(messageBand ? ["Normal"] : []),
            ]}
            rows={labels.map((label, index) => [
              label,
              formatCount(data.series.messages[index] ?? 0),
              formatCount(data.series.activeUsers[index] ?? 0),
              ...(messageBand
                ? [
                    messageBand[index]
                      ? `${chartCount(messageBand[index][0])}–${chartCount(messageBand[index][1])}`
                      : "—",
                  ]
                : []),
            ])}
          />
        </Card>
        <Card
          title={`Biaya per ${unit} menurut fitur`}
          description="US$ · termasuk proses latar dan memori"
        >
          <BarChart
            label={`Biaya per ${unit} menurut fitur`}
            labels={labels}
            series={costSeries}
            band={costBand}
            upcomingFrom={upcoming}
            format={chartUsd}
          />
          <ChartLegend items={COST_CATEGORIES} className="mt-4" />
          <ChartTable
            caption={`Biaya per ${rowUnit} menurut fitur, dalam dolar AS`}
            columns={[
              hourly ? "Jam" : "Tanggal",
              ...COST_CATEGORIES.map(({ label }) => label),
              "Total",
            ]}
            rows={labels.map((label, index) => [
              label,
              ...costSeries.map((entry) => formatUsd(entry.values[index] ?? 0)),
              formatUsd(data.series.costUsd[index] ?? 0),
            ])}
          />
        </Card>
      </div>
    </section>
  );
}
