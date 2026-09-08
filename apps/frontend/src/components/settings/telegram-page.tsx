import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, Link2, Send, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError } from "@/components/forms/form-fields";
import {
  telegramStatusQueryOptions,
  useCreateTelegramLink,
  useUnlinkTelegram,
} from "@/lib/services/api/telegram/telegram.queries";
import type { TelegramLink } from "@/lib/services/api/telegram/telegram.api";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function TelegramIntegrationCard() {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const unlinkMutation = useUnlinkTelegram();
  const linkMutation = useCreateTelegramLink();
  const linkAwaitingLink = Boolean(link && Date.parse(link.expiresAt) > now);

  const statusQuery = useQuery(telegramStatusQueryOptions(linkAwaitingLink));
  const status = statusQuery.data;
  const linked = status?.linked ?? false;

  useEffect(() => {
    if (!linkAwaitingLink) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [linkAwaitingLink]);

  async function handleUnlink() {
    await unlinkMutation.mutateAsync();
    setDialogOpen(false);
  }

  async function handleCreateLink() {
    setLink(await linkMutation.mutateAsync());
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
              <Send className="size-5 text-brand-deep" /> Telegram
            </h2>
            {status ? (
              <Badge dot={linked ? "brand" : "ink-weak"}>
                {linked ? "Tertaut" : "Belum tertaut"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-[1.6] text-ink-muted">
            Tautkan akun Telegram pribadi Anda untuk mengobrol dengan Sydia
            melalui bot Telegram
            {status?.botUsername ? ` @${status.botUsername}` : ""}. Bot ini
            dipakai bersama oleh semua pengguna — tautan hanya mengaitkan
            pesan dari akun Anda dengan akun ini.
          </p>
        </div>
        {status?.linked ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="dark-outline" size="sm" className="shrink-0" />
              }
            >
              <Unplug /> Putuskan tautan
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Putuskan tautan Telegram?</DialogTitle>
              <DialogDescription className="mt-3">
                Sydia berhenti mengaitkan pesan dari akun Telegram ini dengan
                akun Anda dan tidak akan mengirim pesan proaktif ke akun
                tersebut. Bot Sydia tetap tersedia dan Anda dapat menautkan
                ulang kapan pun dengan tautan baru.
              </DialogDescription>
              {unlinkMutation.error ? (
                <div className="mt-4">
                  <FormError message={unlinkMutation.error.message} />
                </div>
              ) : null}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unlinkMutation.isPending}
                  onClick={() => setDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={unlinkMutation.isPending}
                  onClick={() => void handleUnlink()}
                >
                  {unlinkMutation.isPending
                    ? "Memutuskan…"
                    : "Ya, putuskan tautan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      {statusQuery.isPending ? (
        <p className="mt-3 text-sm text-ink-muted" role="status">
          Memeriksa koneksi…
        </p>
      ) : null}
      {statusQuery.isError ? (
        <div className="mt-4">
          <p className="text-sm text-destructive" role="alert">
            Status Telegram tidak dapat dimuat: {statusQuery.error.message}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void statusQuery.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      ) : null}
      {status ? (
        <>
          {linked ? (
            <dl className="mt-6 space-y-3 text-[15px]">
              {status.username ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <dt className="text-ink-muted">Nama pengguna</dt>
                  <dd className="font-semibold text-ink">@{status.username}</dd>
                </div>
              ) : null}
              {status.firstName ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <dt className="text-ink-muted">Nama</dt>
                  <dd className="text-ink">{status.firstName}</dd>
                </div>
              ) : null}
              {status.lastInboundAt ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <dt className="text-ink-muted">Pesan masuk terakhir</dt>
                  <dd className="text-ink">
                    <time dateTime={status.lastInboundAt}>
                      {formatDateTime(status.lastInboundAt)}
                    </time>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {!linked ? (
            status.available === false ? (
              <p className="mt-6 text-sm text-ink-muted" role="status">
                Integrasi Telegram belum tersedia di server ini.
              </p>
            ) : (
              <div className="mt-6 border-t border-surface-1 pt-6">
                <h3 className="text-[15px] font-semibold text-ink">
                  Tautkan akun Telegram Anda
                </h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] text-ink-muted">
                  <li>Buat tautan sekali pakai.</li>
                  <li>
                    Buka tautan tersebut — Telegram terbuka pada percakapan
                    dengan bot Sydia
                    {status.botUsername ? ` (@${status.botUsername})` : ""}.
                  </li>
                  <li>
                    Tekan Mulai. Status diperbarui otomatis begitu akun
                    tertaut.
                  </li>
                </ol>
                <p className="mt-3 text-sm text-ink-muted">
                  Demi keamanan, tautan hanya berlaku beberapa menit dan hanya
                  dapat dipakai sekali. Bot Sydia tidak pernah meminta kata
                  sandi Anda.
                </p>
                {linkAwaitingLink && link ? (
                  <div className="mt-5 space-y-4" aria-live="polite">
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <ExternalLink /> Buka Telegram
                    </Button>
                    <p className="text-sm text-ink-muted">
                      Tautan berlaku sampai pukul{" "}
                      <time dateTime={link.expiresAt}>
                        {formatClock(link.expiresAt)}
                      </time>
                      . Menunggu akun Telegram Anda tertaut…
                    </p>
                  </div>
                ) : null}
                {link && !linkAwaitingLink ? (
                  <p className="mt-5 text-sm text-ink-muted" role="status">
                    Tautan sebelumnya kedaluwarsa. Buat tautan baru untuk
                    melanjutkan.
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <Button
                    variant={linkAwaitingLink ? "dark-outline" : "primary"}
                    size="sm"
                    disabled={linkMutation.isPending}
                    onClick={() => void handleCreateLink()}
                  >
                    <Link2 />
                    {linkMutation.isPending
                      ? "Membuat tautan…"
                      : linkAwaitingLink
                        ? "Buat tautan baru"
                        : "Buat tautan Telegram"}
                  </Button>
                </div>
                {linkMutation.error ? (
                  <div className="mt-4">
                    <FormError message={linkMutation.error.message} />
                  </div>
                ) : null}
              </div>
            )
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
