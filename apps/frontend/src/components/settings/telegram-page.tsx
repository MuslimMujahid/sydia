import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/forms/form-fields";
import {
  telegramStatusQueryOptions,
  useCreateTelegramLink,
  useUnlinkTelegram,
} from "@/lib/services/api/telegram/telegram.queries";
import type { TelegramLink } from "@/lib/services/api/telegram/telegram.api";
import { Check, ExternalLink, LoaderCircle } from "lucide-react";
import { IntegrationRow } from "./integration-row";

interface TelegramIntegrationCardProps {
  onboarding?: boolean;
}

export function TelegramIntegrationCard({
  onboarding = false,
}: TelegramIntegrationCardProps) {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const linkMutation = useCreateTelegramLink();
  const unlinkMutation = useUnlinkTelegram();
  const linkAwaitingConfirmation = Boolean(
    link && Date.parse(link.expiresAt) > now
  );

  const statusQuery = useQuery({
    ...telegramStatusQueryOptions(),
    refetchInterval: (query) =>
      linkAwaitingConfirmation && !query.state.data?.linked ? 3_000 : false,
    refetchIntervalInBackground: linkAwaitingConfirmation,
  });

  const status = statusQuery.data;
  const linked = status?.linked === true;

  useEffect(() => {
    if (!linkAwaitingConfirmation || linked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [linkAwaitingConfirmation, linked]);

  function handleCreateLink() {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    else
      console.warn(
        "Telegram authorization popup was blocked; showing an inline continuation link."
      );

    linkMutation.mutate(undefined, {
      onSuccess: (createdLink) => {
        setNow(Date.now());
        setLink(createdLink);
        if (popup && !popup.closed) popup.location.replace(createdLink.url);
      },
      onError: () => popup?.close(),
    });
  }

  return (
    <IntegrationRow
      onboarding={onboarding}
      id="integration-telegram"
      title="Telegram"
      account={
        linked
          ? status?.username
            ? `@${status.username.replace(/^@/, "")}`
            : status?.firstName
          : null
      }
      logoSrc="/images/brands/telegram.svg"
      checked={linked}
      disabled={
        !status ||
        statusQuery.isError ||
        linkMutation.isPending ||
        unlinkMutation.isPending ||
        (!linked && (status.available === false || linkAwaitingConfirmation))
      }
      onCheckedChange={(checked) => {
        if (checked) handleCreateLink();
        else
          unlinkMutation.mutate(undefined, { onSuccess: () => setLink(null) });
      }}
      description="Mengobrol dan menerima pengingat melalui Telegram."
    >
      {onboarding && linked ? (
        <div className="space-y-5">
          <p
            className="flex items-center gap-3 rounded-sm bg-[#effcf4] p-3 text-[13px] text-[#128c4a]"
            role="status"
          >
            <Check className="size-4 shrink-0" />
            Sydia siap mengobrol dan mengirim pengingat lewat Telegram.
          </p>
          <div className="flex items-center gap-3 px-3">
            <img src="/images/brands/telegram.svg" alt="" className="size-5" />
            <div>
              <p className="text-xs text-ink-muted">Akun Telegram</p>
              <p className="mt-1 text-sm font-medium">
                {status?.username
                  ? `@${status.username.replace(/^@/, "")}`
                  : status?.firstName}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {onboarding && !linked && status?.available !== false ? (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-ink-muted">
            Ketuk tombol di bawah. Telegram akan membuka bot Sydia, lalu ketuk
            Start untuk menautkan akun Anda.
          </p>
          {linkAwaitingConfirmation && link ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#20a8df] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0f6e9c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ExternalLink className="size-4" />
              Buka Telegram
            </a>
          ) : (
            <Button
              type="button"
              disabled={
                !status || statusQuery.isError || linkMutation.isPending
              }
              onClick={handleCreateLink}
              variant="dark"
              className="bg-[#20a8df] hover:bg-[#0f6e9c]"
            >
              <ExternalLink className="size-4" />
              {linkMutation.isPending ? "Menyiapkan tautan…" : "Buka Telegram"}
            </Button>
          )}
          {linkAwaitingConfirmation && link && (
            <p
              className="flex items-center gap-2 text-xs text-ink-muted"
              role="status"
            >
              <LoaderCircle className="size-3.5 animate-spin text-brand motion-reduce:animate-none" />
              Menunggu konfirmasi dari Telegram · tautan berlaku{" "}
              {Math.floor((Date.parse(link.expiresAt) - now) / 60000)}:
              {String(
                Math.floor((Date.parse(link.expiresAt) - now) / 1000) % 60
              ).padStart(2, "0")}
            </p>
          )}
        </div>
      ) : null}
      {statusQuery.isPending ? (
        <p className="text-sm text-ink-muted" role="status">
          Memeriksa koneksi…
        </p>
      ) : null}
      {linkMutation.isPending ? (
        <p className="text-sm text-ink-muted" role="status">
          Menyiapkan tautan Telegram…
        </p>
      ) : null}
      {statusQuery.isError ? (
        <>
          <FormError message={statusQuery.error.message} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void statusQuery.refetch()}
          >
            Coba lagi
          </Button>
        </>
      ) : null}
      {status?.available === false && !linked ? (
        <p className="text-sm text-ink-muted" role="status">
          Integrasi Telegram belum tersedia di server ini.
          {status.notice ? ` ${status.notice}` : ""}
        </p>
      ) : null}
      {!linked && linkAwaitingConfirmation && link ? (
        <p className="text-sm text-ink-muted" role="status">
          Selesaikan penghubungan akun di Telegram. Jika tab tidak terbuka,{" "}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-link underline underline-offset-2"
          >
            lanjutkan di Telegram
          </a>
          .
        </p>
      ) : null}
      {!linked && link && !linkAwaitingConfirmation ? (
        <p className="text-sm text-ink-muted" role="status">
          Tautan kedaluwarsa. Aktifkan kembali untuk membuat tautan baru.
        </p>
      ) : null}
      {linkMutation.error ? (
        <FormError message={linkMutation.error.message} />
      ) : null}
      {unlinkMutation.error ? (
        <FormError message={unlinkMutation.error.message} />
      ) : null}
    </IntegrationRow>
  );
}
