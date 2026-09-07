import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, Link2, Send, Unplug } from "lucide-react";
import { DomainInlineError } from "@/components/domain/domain-page";
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
import type {
  TelegramLink,
  TelegramStatus,
} from "@/lib/services/api/telegram/telegram.api";
import { SettingsPageHeader } from "./settings-nav";

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

function StatusSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Memuat status Telegram"
    >
      {[0, 1].map((row) => (
        <span
          key={row}
          className="block h-28 animate-pulse rounded-lg bg-surface-1 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function LinkedIdentityCard({ status }: { status: TelegramStatus }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const unlinkMutation = useUnlinkTelegram();

  async function handleUnlink() {
    await unlinkMutation.mutateAsync();
    setDialogOpen(false);
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Identitas tertaut
          </h2>
          <dl className="mt-4 space-y-3 text-[15px]">
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
            {status.externalId ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className="text-ink-muted">ID Telegram</dt>
                <dd className="font-mono text-sm text-ink-muted">
                  {status.externalId}
                </dd>
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
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button variant="dark-outline" size="sm" className="shrink-0" />
            }
          >
            {" "}
            <Unplug /> Putuskan tautan
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Putuskan tautan Telegram?</DialogTitle>
            <DialogDescription className="mt-3">
              Sydia berhenti mengaitkan pesan dari akun Telegram ini dengan akun
              Anda dan tidak akan mengirim pesan proaktif ke akun tersebut. Bot
              Sydia tetap tersedia dan Anda dapat menautkan ulang kapan pun
              dengan tautan baru.
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
      </div>
    </Card>
  );
}

function LinkTelegramCard({
  status,
  link,
  linkActive,
  onLinkCreated,
}: {
  status: TelegramStatus;
  link: TelegramLink | null;
  linkActive: boolean;
  onLinkCreated: (link: TelegramLink | null) => void;
}) {
  const linkMutation = useCreateTelegramLink();

  async function handleCreateLink() {
    onLinkCreated(await linkMutation.mutateAsync());
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
        Tautkan akun Telegram Anda
      </h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-ink-muted">
        <li>Buat tautan sekali pakai di bawah.</li>
        <li>
          Buka tautan tersebut — Telegram akan terbuka pada percakapan dengan
          bot Sydia
          {status.botUsername ? ` (@${status.botUsername})` : ""}.
        </li>
        <li>
          Tekan Mulai di Telegram. Status di halaman ini diperbarui otomatis
          begitu akun tertaut.
        </li>
      </ol>
      <p className="mt-4 text-sm text-ink-muted">
        Demi keamanan, tautan hanya berlaku beberapa menit dan hanya dapat
        dipakai sekali. Bot Sydia tidak pernah meminta kata sandi Anda.
      </p>
      {linkActive && link ? (
        <div className="mt-6 space-y-4" aria-live="polite">
          <Button
            size="sm"
            nativeButton={false}
            render={
              <a href={link.url} target="_blank" rel="noopener noreferrer" />
            }
          >
            <ExternalLink /> Buka Telegram
          </Button>
          <p className="text-sm text-ink-muted">
            Tautan berlaku sampai pukul{" "}
            <time dateTime={link.expiresAt}>{formatClock(link.expiresAt)}</time>
            . Menunggu akun Telegram Anda tertaut…
          </p>
        </div>
      ) : null}
      {link && !linkActive && !status.linked ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Tautan sebelumnya kedaluwarsa. Buat tautan baru untuk melanjutkan.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          variant={linkActive ? "dark-outline" : "primary"}
          size="sm"
          disabled={linkMutation.isPending}
          onClick={() => void handleCreateLink()}
        >
          <Link2 />
          {linkMutation.isPending
            ? "Membuat tautan…"
            : linkActive
              ? "Buat tautan baru"
              : "Buat tautan Telegram"}
        </Button>
      </div>
      {linkMutation.error ? (
        <div className="mt-4">
          <FormError message={linkMutation.error.message} />
        </div>
      ) : null}
    </Card>
  );
}

export function UserTelegramSettingsPage() {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const linkAwaitingLink = Boolean(link && Date.parse(link.expiresAt) > now);

  const statusQuery = useQuery(telegramStatusQueryOptions(linkAwaitingLink));
  const status = statusQuery.data;

  useEffect(() => {
    if (!linkAwaitingLink) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [linkAwaitingLink]);

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Telegram"
        title="Akun Telegram Anda"
        description="Tautkan akun Telegram pribadi Anda sebagai identitas akun. Setelah tertaut, Anda dapat mengobrol dengan Sydia melalui bot Telegram Sydia."
      />
      {statusQuery.isPending ? <StatusSkeleton /> : null}
      {statusQuery.isError ? (
        <DomainInlineError
          title="Status Telegram tidak dapat dimuat"
          message={statusQuery.error.message}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : null}
      {status ? (
        <>
          <Badge dot={status.linked ? "brand" : "ink-weak"}>
            {status.linked
              ? "Akun Telegram tertaut"
              : "Akun Telegram belum tertaut"}
          </Badge>
          {!status.available ? (
            <p className="text-sm text-ink-muted" role="status">
              Integrasi Telegram belum tersedia di server ini.
            </p>
          ) : status.linked ? (
            <LinkedIdentityCard status={status} />
          ) : (
            <LinkTelegramCard
              status={status}
              link={link}
              linkActive={linkAwaitingLink}
              onLinkCreated={setLink}
            />
          )}
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <Send className="mt-0.5 size-5 shrink-0 text-brand-deep" />
              <div>
                <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                  Cara kerja bot Telegram
                </h2>
                <p className="mt-2 text-ink-muted">
                  Sydia memiliki satu bot Telegram
                  {status.botUsername ? ` (@${status.botUsername})` : ""} yang
                  digunakan bersama oleh semua pengguna. Tautan ini hanya
                  memberi tahu Sydia bahwa pesan dari akun Telegram Anda adalah
                  milik akun ini — bot tidak berubah dan tidak dibuat khusus
                  untuk Anda.
                </p>
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
