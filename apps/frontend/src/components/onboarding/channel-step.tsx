import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone, ThumbsUp } from "lucide-react";
import { FormError } from "@/components/forms/form-fields";
import { TelegramIntegrationCard } from "@/components/settings/telegram-page";
import { WhatsAppIntegrationCard } from "@/components/settings/whatsapp-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { telegramStatusQueryOptions } from "@/lib/services/api/telegram/telegram.queries";
import { whatsappStatusQueryOptions } from "@/lib/services/api/whatsapp/whatsapp.queries";
import { cn } from "@/lib/utils/cn";

type Channel = "telegram" | "whatsapp";

interface OnboardingChannelStepProps {
  saving: boolean;
  error?: string;
  onBack: () => void;
  onFinish: () => void;
}

export function OnboardingChannelStep({
  saving,
  error,
  onBack,
  onFinish,
}: OnboardingChannelStepProps) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [connecting, setConnecting] = useState(false);
  const telegram = useQuery({
    ...telegramStatusQueryOptions(),
    enabled: connecting && channel === "telegram",
  });

  const whatsapp = useQuery({
    ...whatsappStatusQueryOptions(),
    enabled: connecting && channel === "whatsapp",
  });

  const ready =
    connecting &&
    (channel === "telegram"
      ? telegram.data?.linked === true && !telegram.isError
      : whatsapp.data?.setupPhase === "ready" &&
        whatsapp.data.connected &&
        !whatsapp.isError);

  const verifying =
    whatsapp.data?.setupPhase === "owner_verification" ||
    whatsapp.data?.setupPhase === "owner_conflict";

  const heading = !connecting
    ? "Di mana kamu mau mengobrol dengan Sydia?"
    : channel === "telegram"
      ? ready
        ? "Telegram sudah terhubung"
        : "Hubungkan Telegram"
      : ready
        ? "WhatsApp sudah terhubung"
        : verifying
          ? "Verifikasi nomor pribadi"
          : "Tautkan nomor asisten";

  useEffect(() => {
    document.getElementById("onboarding-title")?.focus();
  }, [heading]);

  return (
    <>
      <h1
        id="onboarding-title"
        tabIndex={-1}
        className="mb-8 max-w-xl font-display text-[32px] leading-[1.15] font-bold tracking-[-0.03em] text-ink outline-none sm:text-[44px] sm:leading-[1.1]"
      >
        {heading}
      </h1>
      <Card className="p-6 sm:p-8">
        {!connecting ? (
          <>
            <p className="mb-5 text-sm leading-6 text-ink-muted">
              Pilih satu saluran untuk chat dan pengingat. Kamu bisa
              menggantinya kapan saja di Pengaturan.
            </p>
            <RadioGroup
              aria-label="Saluran chat"
              value={channel}
              onValueChange={(value) => setChannel(value as Channel)}
              className="space-y-3"
            >
              <ChannelOption
                value="telegram"
                selected={channel === "telegram"}
              />
              {WHATSAPP_INTEGRATION_ENABLED && (
                <ChannelOption
                  value="whatsapp"
                  selected={channel === "whatsapp"}
                />
              )}
            </RadioGroup>
          </>
        ) : (
          <>
            {channel === "telegram" ? (
              <TelegramIntegrationCard onboarding />
            ) : (
              <WhatsAppIntegrationCard onboarding />
            )}
            {!ready && (
              <Button
                type="button"
                variant="link"
                className="mt-3 h-9 min-h-9 px-0 text-[13px] text-ink-muted underline"
                disabled={saving}
                onClick={() => {
                  setConnecting(false);
                  setChannel(
                    channel === "telegram" && WHATSAPP_INTEGRATION_ENABLED
                      ? "whatsapp"
                      : "telegram"
                  );
                }}
              >
                Ganti {channel === "whatsapp" ? "ke Telegram" : "saluran"}
              </Button>
            )}
          </>
        )}
        <FormError message={error} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="dark-outline"
            disabled={saving}
            onClick={connecting ? () => setConnecting(false) : onBack}
          >
            Kembali
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
            {!ready && (
              <Button
                type="button"
                variant="link"
                className="px-0 text-sm font-normal text-ink-muted underline underline-offset-2"
                disabled={saving}
                onClick={onFinish}
              >
                {saving ? "Menyimpan…" : "Lewati untuk sekarang"}
              </Button>
            )}
            <Button
              type="button"
              disabled={saving || (!connecting ? channel === null : !ready)}
              onClick={connecting ? onFinish : () => setConnecting(true)}
            >
              {saving
                ? "Menyimpan pengaturan…"
                : ready
                  ? "Simpan dan lanjutkan"
                  : !connecting && channel === "whatsapp"
                    ? "Saya punya dua nomor"
                    : "Lanjutkan"}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

interface ChannelOptionProps {
  value: Channel;
  selected: boolean;
}

function ChannelOption({ value, selected }: ChannelOptionProps) {
  const telegram = value === "telegram";

  return (
    <div
      className={cn(
        "rounded-md border transition-colors duration-200 motion-reduce:transition-none",
        selected ? "border-brand bg-brand/[0.03]" : "border-ink/12"
      )}
    >
      <label className="flex cursor-pointer items-start gap-4 p-5 has-[[data-focused]]:outline-2 has-[[data-focused]]:outline-offset-2 has-[[data-focused]]:outline-brand">
        <img
          src={
            telegram
              ? "/images/brands/telegram.svg"
              : "/images/brands/whatsapp-circle.svg"
          }
          alt=""
          className="mt-0.5 size-7 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span
            id={`onboarding-channel-${value}`}
            className="flex items-center gap-2 text-[15px] font-semibold"
          >
            {telegram ? "Telegram" : "WhatsApp"}
            {telegram && (
              <ThumbsUp aria-hidden="true" className="size-4 text-brand" />
            )}
          </span>
          <span className="mt-1.5 block text-[13px] leading-5 text-ink-muted">
            {telegram
              ? "Hubungkan akun Telegram Anda dalam satu ketukan. Tidak perlu nomor tambahan."
              : "Mengobrol dan menerima pengingat lewat WhatsApp. Perlu satu nomor tambahan untuk asisten."}
          </span>
        </span>
        <Radio
          value={value}
          aria-labelledby={`onboarding-channel-${value}`}
          className="mt-4 shrink-0"
        />
      </label>
      {!telegram && selected && (
        <div className="mx-5 border-t border-hairline pt-5 pb-6 sm:ml-16 sm:mr-6">
          <h2 className="text-sm font-semibold">
            Sydia butuh dua nomor WhatsApp
          </h2>
          <ol className="mt-4 space-y-3 text-[13px] leading-5">
            <li className="flex gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-[#c23d6a]">
                1
              </span>
              <div>
                <p className="font-semibold">Nomor asisten</p>
                <p className="mt-1 text-ink-muted">
                  Nomor kedua yang akan menjadi Sydia. Jangan gunakan nomor
                  pribadi Anda.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-[#c23d6a]">
                2
              </span>
              <div>
                <p className="font-semibold">Nomor pribadi Anda</p>
                <p className="mt-1 text-ink-muted">
                  Nomor yang biasa Anda pakai. Dari sini Anda mengobrol dan
                  menerima pengingat dari Sydia.
                </p>
              </div>
            </li>
          </ol>
          <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-1 p-3 text-xs leading-5 text-ink-muted">
            <Smartphone className="mt-0.5 size-4 shrink-0" />
            Siapkan ponsel nomor asisten. Anda akan memindai QR dengan ponsel
            itu.
          </p>
        </div>
      )}
    </div>
  );
}
