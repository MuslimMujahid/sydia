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
import { IntegrationRow } from "./integration-row";

export function TelegramIntegrationCard() {
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
