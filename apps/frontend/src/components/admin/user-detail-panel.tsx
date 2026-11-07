import type { ReactNode } from "react";
import {
  Activity,
  Clock3,
  CreditCard,
  Globe,
  MessageCircle,
  Send,
} from "lucide-react";
import { formatBytes, formatCount, formatDate, formatUsd } from "./format";
import type { AdminUser } from "./types";
import { cn } from "@/lib/utils/cn";

export function remainingDays(value: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 86_400_000));
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[38px] items-center justify-between gap-3 border-b border-ink/6 py-2 last:border-0">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function Channels({ channels }: { channels: string[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {channels.length === 0 && (
        <span className="text-ink-muted">Belum ada</span>
      )}
      {channels.map((channel) => {
        const Icon =
          channel === "web"
            ? Globe
            : channel === "whatsapp"
              ? MessageCircle
              : Send;

        return (
          <span
            key={channel}
            title={channel}
            className={cn(
              "inline-flex size-[22px] items-center justify-center rounded-md",
              channel === "web"
                ? "bg-ink/8 text-ink"
                : channel === "whatsapp"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-sky-50 text-sky-500"
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="sr-only">{channel}</span>
          </span>
        );
      })}
    </span>
  );
}

export function UserDetailPanel({
  user,
  now,
}: {
  user: AdminUser;
  now: number;
}) {
  const paid = user.plan === "plus";
  const trialUrgent =
    user.plan === "trial" &&
    user.trialEndsAt !== null &&
    remainingDays(user.trialEndsAt, now) <= 3;

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[1.51fr_1.07fr_1fr]">
      <section className="rounded-[14px] border border-ink/6 bg-canvas px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex size-[26px] items-center justify-center rounded-[8px] bg-brand/10 text-brand">
            <Activity className="size-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold">Penggunaan</h3>
          <span className="ml-auto text-xs text-ink-muted">
            Sepanjang waktu
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 text-[13px]">
          <dl>
            <DetailRow label="Percakapan">
              {formatCount(user.usage.conversations)}
            </DetailRow>
            <DetailRow label="Dokumen">
              {formatCount(user.usage.documents)}
            </DetailRow>
            <DetailRow label="Memori">
              {formatCount(user.usage.memories)}
            </DetailRow>
            <DetailRow label="Pengingat">
              {formatCount(user.usage.reminders)}
            </DetailRow>
          </dl>
          <dl>
            <DetailRow label="Tugas">{formatCount(user.usage.tasks)}</DetailRow>
            <DetailRow label="Kontak">
              {formatCount(user.usage.contacts)}
            </DetailRow>
            <DetailRow label="Acara">
              {formatCount(user.usage.events)}
            </DetailRow>
            <DetailRow label="Kanal">
              <Channels channels={user.channels} />
            </DetailRow>
          </dl>
        </div>
      </section>
      <section className="rounded-[14px] border border-ink/6 bg-canvas px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex size-[26px] items-center justify-center rounded-[8px] bg-violet-50 text-violet-500">
            <CreditCard className="size-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold">Langganan</h3>
        </div>
        <dl className="text-[13px]">
          {paid ? (
            <>
              <DetailRow label="Paket">
                <span className="text-brand">Sydia Plus</span>
              </DetailRow>
              <DetailRow label="Aktif hingga">
                {user.paidUntil &&
                  `${formatDate(user.paidUntil)} · ${remainingDays(user.paidUntil, now)} hari lagi`}
              </DetailRow>
            </>
          ) : (
            <DetailRow label="Trial berakhir">
              <span className={cn(trialUrgent && "text-orange-700")}>
                {user.trialEndsAt
                  ? `${formatDate(user.trialEndsAt)}${user.plan === "trial" ? ` · ${remainingDays(user.trialEndsAt, now)} hari lagi` : ""}`
                  : "Belum diberlakukan"}
              </span>
            </DetailRow>
          )}
          <DetailRow label="Pembayaran">
            {user.payments === 0
              ? "Belum ada"
              : `${formatCount(user.payments)}× · Rp ${formatCount(user.paymentTotalIdr)}`}
          </DetailRow>
          {paid ? (
            <DetailRow label="Terakhir dibayar">
              {user.lastPaymentAt
                ? formatDate(user.lastPaymentAt)
                : "Belum ada"}
              {user.lastPaymentMethod && ` · ${user.lastPaymentMethod}`}
            </DetailRow>
          ) : (
            <>
              <DetailRow label="Sumber">
                {user.acquisitionSource ?? "Langsung"}
              </DetailRow>
              <DetailRow label="Onboarding">
                <span
                  className={cn(!user.onboardingCompleted && "text-orange-700")}
                >
                  {user.onboardingCompleted ? "Selesai" : "Belum selesai"}
                </span>
              </DetailRow>
            </>
          )}
        </dl>
      </section>
      <section className="rounded-[14px] border border-ink/6 bg-canvas px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex size-[26px] items-center justify-center rounded-[8px] bg-ink/10">
            <Clock3 className="size-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold">Sesi & biaya</h3>
        </div>
        <dl className="text-[13px]">
          <DetailRow label="Sesi aktif">
            {formatCount(user.activeSessions)}
          </DetailRow>
          <DetailRow label="Penyimpanan">
            {formatBytes(user.storageBytes)}
          </DetailRow>
          <DetailRow label="Biaya LLM total">
            {formatUsd(user.llmCostUsd)}
          </DetailRow>
          <DetailRow label="Biaya 30 hari">
            {formatUsd(user.llmCost30DaysUsd)}
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}
