import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { FEATURE_LABELS, percent, stageLabel } from "../analytics/meta";
import { Card } from "../analytics/widgets";
import { formatCount, formatUsd } from "../format";
import type { AdminAttention, AdminPeriod, AdminSummary } from "../types";
import { clockTime, dateTime, signed, signedUsd } from "./summary-format";

type Severity = "warn" | "bad" | "neutral";

/** Rows shown on phones before the "Lihat N lainnya" toggle. */
const MOBILE_LIMIT = 3;

const SEVERITY: Record<AdminAttention["kind"], Severity> = {
  "cost-outpacing": "warn",
  "user-leak": "bad",
  wasted: "warn",
  "failed-runs": "bad",
  "expiring-trials": "neutral",
  "expiring-plus": "neutral",
};

const ICON_TONES: Record<Severity, string> = {
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
  neutral: "bg-ink/6 text-ink-muted",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  warn: "Peringatan",
  bad: "Penting",
  neutral: "Info",
};

const ACTION_CLASS =
  "inline-flex shrink-0 items-center gap-0.5 rounded-md py-1 text-[13px] font-medium text-pink-700 outline-none hover:text-pink-800 focus-visible:ring-2 focus-visible:ring-brand";

type AttentionListProps = {
  data: AdminSummary;
  period: AdminPeriod;
};

type AttentionCopy = { title: string; description: string };

function pct(value: number | null): string {
  return value === null ? "baru" : signed(value, (n) => percent(n, 0));
}

function attentionCopy(
  item: AdminAttention,
  data: AdminSummary
): AttentionCopy {
  switch (item.kind) {
    case "cost-outpacing": {
      const drivers = item.drivers
        .map(
          (driver) =>
            `${FEATURE_LABELS[driver.feature]} ${signedUsd(driver.deltaUsd)}`
        )
        .join(", ");

      return {
        title: "Biaya naik lebih cepat dari pemakaian",
        description: `Biaya ${pct(item.costChange)} sementara pesan ${pct(item.messageChange)}.${drivers ? ` Pendorong: ${drivers}.` : ""}`,
      };
    }

    case "user-leak":
      return {
        title: `${item.name} · biaya tinggi, pemakaian rendah`,
        description: `${formatUsd(item.costUsd)} dari ${formatCount(item.actions)} aksi · ${item.multiple.toLocaleString("id-ID", { maximumFractionDigits: 1 })}× biaya tipikal · ${percent(item.backgroundShare * 100, 0)} proses latar`,
      };
    case "wasted":
      return {
        title: "Panggilan gagal & diulang",
        description: `${formatUsd(item.costUsd)} (${percent(item.share * 100)} biaya) terbuang${item.topStage ? ` · terbanyak di ${stageLabel(item.topStage)}` : ""}`,
      };
    case "failed-runs":
      return {
        title: "Run asisten gagal",
        description: `${formatCount(item.failed)} dari ${formatCount(item.total)} run${item.lastFailedAt ? ` · terakhir ${clockTime(item.lastFailedAt, data)} WIB` : ""}`,
      };
    case "expiring-trials":
      return {
        title: "Trial berakhir ≤ 7 hari",
        description: `${formatCount(item.count)} akun · ${formatCount(item.active)} aktif dalam 30 hari`,
      };
    case "expiring-plus":
      return {
        title: "Sydia Plus berakhir ≤ 7 hari",
        description: `${formatCount(item.count)} akun`,
      };
  }
}

function ActionLabel({
  children,
  context,
}: {
  children: string;
  /** The item's title, so every link names what it opens. */
  context: string;
}) {
  return (
    <>
      <span className="max-sm:sr-only">{children}</span>
      <span className="sr-only">: {context}</span>
      <ChevronRight aria-hidden="true" className="size-4" />
    </>
  );
}

function AttentionAction({
  item,
  data,
  period,
  context,
}: {
  item: AdminAttention;
  data: AdminSummary;
  period: AdminPeriod;
  context: string;
}): ReactNode {
  switch (item.kind) {
    case "cost-outpacing":
      return (
        <Link to="/admin/costs" search={{ period }} className={ACTION_CLASS}>
          <ActionLabel context={context}>Lihat biaya</ActionLabel>
        </Link>
      );
    case "wasted":
      return (
        <Link to="/admin/costs" search={{ period }} className={ACTION_CLASS}>
          <ActionLabel context={context}>Lihat proses</ActionLabel>
        </Link>
      );
    case "user-leak":
      return (
        <Link
          to="/admin/users"
          search={{ period, user: item.userId }}
          className={ACTION_CLASS}
        >
          <ActionLabel context={context}>Lihat pengguna</ActionLabel>
        </Link>
      );
    case "expiring-trials":
      return (
        <Link
          to="/admin/users"
          search={{ attention: "trial-expiring" }}
          className={ACTION_CLASS}
        >
          <ActionLabel context={context}>Lihat pengguna</ActionLabel>
        </Link>
      );
    case "expiring-plus":
      return (
        <Link
          to="/admin/users"
          search={{ attention: "plus-expiring" }}
          className={ACTION_CLASS}
        >
          <ActionLabel context={context}>Lihat pengguna</ActionLabel>
        </Link>
      );
    case "failed-runs":
      return <FailuresDialog data={data} context={context} />;
  }
}

function FailuresDialog({
  data,
  context,
}: {
  data: AdminSummary;
  context: string;
}) {
  return (
    <Dialog>
      <DialogTrigger className={ACTION_CLASS}>
        <ActionLabel context={context}>Lihat detail</ActionLabel>
      </DialogTrigger>
      <DialogContent variant="sheet" className="sm:max-w-lg">
        <DialogTitle className="pr-8 text-lg">Run asisten gagal</DialogTitle>
        <DialogDescription className="mt-1 text-sm">
          {formatCount(data.runs.failed)} dari {formatCount(data.runs.total)}{" "}
          run gagal pada periode ini.
        </DialogDescription>
        {data.failures.length ? (
          <ul className="mt-4 max-h-[60dvh] divide-y divide-ink/6 overflow-y-auto">
            {data.failures.map((failure) => (
              <li key={failure.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <time
                    dateTime={failure.createdAt}
                    className="text-sm font-medium"
                  >
                    {dateTime(failure.createdAt, data)} WIB
                  </time>
                  <span className="min-w-0 truncate font-mono text-[11px] text-ink-muted">
                    {failure.model}
                  </span>
                </div>
                <p className="mt-1 text-xs break-words text-ink-muted">
                  {failure.errorMessage ?? "Tanpa pesan galat"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">
            Detail run gagal tidak tersedia.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** What needs follow-up in the window, worst first, each with where to act. */
export function AttentionList({ data, period }: AttentionListProps) {
  const [expanded, setExpanded] = useState(false);
  const items = data.attention;
  const hidden = items.length - MOBILE_LIMIT;

  if (!items.length) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">
          Tidak ada yang perlu ditindaklanjuti.
        </p>
      </Card>
    );
  }

  return (
    <Card bodyClassName="py-1 sm:py-1">
      <ul className="divide-y divide-ink/6">
        {items.map((item, index) => {
          const severity = SEVERITY[item.kind];
          const copy = attentionCopy(item, data);
          const Icon = severity === "neutral" ? Info : AlertTriangle;

          return (
            <li
              key={
                item.kind === "user-leak"
                  ? `${item.kind}-${item.userId}`
                  : item.kind
              }
              className={cn(
                "flex items-center gap-3 py-4",
                !expanded && index >= MOBILE_LIMIT && "max-sm:hidden"
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center self-start rounded-full",
                  ICON_TONES[severity]
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="sr-only">{SEVERITY_LABELS[severity]}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold break-words">
                  {copy.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                  {copy.description}
                </p>
              </div>
              <AttentionAction
                item={item}
                data={data}
                period={period}
                context={copy.title}
              />
            </li>
          );
        })}
      </ul>
      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="-mx-5 mb-[-4px] block w-[calc(100%+2.5rem)] rounded-b-2xl border-t border-ink/6 bg-ink/[0.02] px-5 py-4 text-left text-sm font-medium text-pink-700 outline-none focus-visible:ring-2 focus-visible:ring-brand sm:hidden"
        >
          Lihat {formatCount(hidden)} lainnya
        </button>
      )}
    </Card>
  );
}
