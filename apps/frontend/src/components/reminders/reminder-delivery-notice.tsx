import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { reminderDeliveryQueryOptions } from "@/lib/services/api/reminders/reminders.queries";
import { cn } from "@/lib/utils/cn";

const COPY = {
  no_channel: {
    title: "Pengingat belum bisa sampai ke kamu",
    body: "Sydia mengirim pengingat lewat Telegram atau WhatsApp. Hubungkan salah satunya supaya pengingatmu benar-benar muncul.",
    action: "Hubungkan Telegram",
    to: "/settings/integrations",
  },
  notifications_off: {
    title: "Notifikasi pengingat sedang mati",
    body: "Pengingatmu tersimpan, tapi notifikasi di semua saluran sedang dimatikan, jadi tidak ada yang terkirim.",
    action: "Nyalakan notifikasi",
    to: "/settings/notifications",
  },
} as const;

/**
 * Warns when saved reminders would reach nobody: no Telegram or WhatsApp is
 * connected, or notifications are off on every connected channel. Renders
 * nothing while loading, on failure, or when reminders can be delivered.
 */
export function ReminderDeliveryNotice() {
  const query = useQuery(reminderDeliveryQueryOptions());
  if (!query.data || query.data.status === "reachable") return null;
  const copy = COPY[query.data.status];

  return (
    <section
      role="status"
      aria-labelledby="reminder-delivery-title"
      className="flex flex-col gap-4 rounded-md border border-brand/25 bg-brand/[0.04] p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <BellOff aria-hidden="true" className="size-5 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <h2 id="reminder-delivery-title" className="text-sm font-semibold">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{copy.body}</p>
      </div>
      <Link
        to={copy.to}
        className={cn(
          buttonVariants({ size: "sm" }),
          "shrink-0 self-start sm:self-center"
        )}
      >
        {copy.action}
      </Link>
    </section>
  );
}
