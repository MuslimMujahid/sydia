import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Send } from "lucide-react";
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

type TelegramConnectionState =
  "disconnected" | "pending" | "connected" | "expired";

function telegramUrl(username: string): string {
  return `https://t.me/${username.replace(/^@/, "")}`;
}

export function TelegramIntegrationCard() {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showOpenFallback, setShowOpenFallback] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const previousConnectionState = useRef<TelegramConnectionState | null>(null);
  const connectedMessageRef = useRef<HTMLParagraphElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const unlinkMutation = useUnlinkTelegram();
  const linkMutation = useCreateTelegramLink();
  const linkAwaitingConfirmation = Boolean(
    link && Date.parse(link.expiresAt) > now
  );

  const statusQuery = useQuery(
    telegramStatusQueryOptions(linkAwaitingConfirmation)
  );

  const status = statusQuery.data;
  const botUsername = status?.botUsername;
  const connectionState: TelegramConnectionState = status?.linked
    ? "connected"
    : linkAwaitingConfirmation
      ? "pending"
      : link
        ? "expired"
        : "disconnected";

  useEffect(() => {
    if (!linkAwaitingConfirmation) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [linkAwaitingConfirmation]);

  useEffect(() => {
    const previous = previousConnectionState.current;

    if (previous === "pending" && connectionState === "connected") {
      connectedMessageRef.current?.focus();
    } else if (previous === "connected" && connectionState === "disconnected") {
      connectButtonRef.current?.focus();
    }

    previousConnectionState.current = connectionState;
  }, [connectionState]);

  async function handleUnlink() {
    await unlinkMutation.mutateAsync();
    setDialogOpen(false);
    setLink(null);
  }

  async function handleCreateLink() {
    setShowOpenFallback(false);
    setLink(await linkMutation.mutateAsync());
  }

  const telegramLink =
    connectionState === "connected" && botUsername
      ? telegramUrl(botUsername)
      : link?.url;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
          <Send className="size-5 text-brand-deep" /> Telegram
        </h2>
        {status ? (
          <Badge
            dot={
              connectionState === "connected"
                ? "brand"
                : connectionState === "pending"
                  ? "warn"
                  : "ink-weak"
            }
          >
            {connectionState === "connected"
              ? "Terhubung"
              : connectionState === "pending"
                ? "Menunggu konfirmasi"
                : "Belum terhubung"}
          </Badge>
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
        status.available === false && connectionState !== "connected" ? (
          <p className="mt-4 text-sm text-ink-muted" role="status">
            Integrasi Telegram belum tersedia di server ini.
          </p>
        ) : (
          <div className="mt-3 max-w-xl">
            <p className="sr-only" aria-live="polite">
              {connectionState === "connected"
                ? "Telegram berhasil terhubung."
                : connectionState === "pending"
                  ? "Menunggu konfirmasi dari Telegram."
                  : connectionState === "expired"
                    ? "Tautan penghubung Telegram telah kedaluwarsa."
                    : "Telegram belum terhubung."}
            </p>
            {connectionState === "disconnected" ? (
              <>
                <p className="text-sm leading-[1.6] text-ink-muted">
                  {botUsername
                    ? `Hubungkan Telegram untuk mengobrol dengan Sydia melalui @${botUsername.replace(/^@/, "")}.`
                    : "Hubungkan Telegram untuk mengobrol dengan Sydia."}
                </p>
                <Button
                  ref={connectButtonRef}
                  size="sm"
                  className="mt-6"
                  disabled={linkMutation.isPending}
                  onClick={() => void handleCreateLink()}
                >
                  <Send />
                  {linkMutation.isPending
                    ? "Menghubungkan…"
                    : "Hubungkan Telegram"}
                </Button>
              </>
            ) : null}

            {connectionState === "pending" && telegramLink ? (
              <div>
                <p className="text-sm leading-[1.6] text-ink-muted">
                  Selesaikan penghubungan akun di Telegram.
                </p>
                <Button
                  size="sm"
                  className="mt-6"
                  nativeButton={false}
                  render={
                    <a
                      href={telegramLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowOpenFallback(true)}
                      aria-label="Buka Telegram di tab baru"
                    />
                  }
                >
                  <ExternalLink /> Buka Telegram
                </Button>
                <p
                  className="mt-5 text-sm leading-[1.6] text-ink-muted"
                  role="status"
                >
                  Menunggu konfirmasi dari Telegram…
                  <br />
                  Halaman ini akan diperbarui otomatis.
                </p>
                {showOpenFallback ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    Tidak berhasil membuka Telegram?{" "}
                    <a
                      href={telegramLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Buka Telegram di tab baru"
                    >
                      Buka Telegram
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            {connectionState === "connected" ? (
              <>
                <p
                  ref={connectedMessageRef}
                  tabIndex={-1}
                  className="text-sm leading-[1.6] text-ink-muted outline-none"
                >
                  {status.username
                    ? `Terhubung sebagai @${status.username.replace(/^@/, "")}.`
                    : "Akun Telegram telah terhubung."}
                  <br />
                  Anda sekarang dapat mengobrol dengan Sydia melalui Telegram.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {telegramLink ? (
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={telegramLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Buka Telegram di tab baru"
                        />
                      }
                    >
                      <ExternalLink /> Buka Telegram
                    </Button>
                  ) : null}
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger
                      render={<Button variant="ghost" size="sm" />}
                    >
                      Putuskan
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle>Putuskan Telegram?</DialogTitle>
                      <DialogDescription className="mt-3">
                        Sydia berhenti mengaitkan pesan dari akun Telegram ini
                        dengan akun Anda. Anda dapat menghubungkannya kembali
                        kapan saja.
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
                            : "Ya, putuskan"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </>
            ) : null}

            {connectionState === "expired" ? (
              <>
                <p
                  className="text-sm leading-[1.6] text-ink-muted"
                  role="status"
                >
                  Tautan penghubung sebelumnya telah kedaluwarsa.
                </p>
                <Button
                  size="sm"
                  className="mt-6"
                  disabled={linkMutation.isPending}
                  onClick={() => void handleCreateLink()}
                >
                  <RefreshCw />
                  {linkMutation.isPending ? "Mencoba lagi…" : "Coba lagi"}
                </Button>
              </>
            ) : null}

            {linkMutation.error ? (
              <div className="mt-4">
                <FormError message={linkMutation.error.message} />
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </Card>
  );
}
