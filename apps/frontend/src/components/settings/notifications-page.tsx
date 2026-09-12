import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { whatsappStatusQueryOptions } from "@/lib/services/api/whatsapp/whatsapp.queries";
import { telegramStatusQueryOptions } from "@/lib/services/api/telegram/telegram.queries";
import {
  userPreferencesQueryOptions,
  useUpdateUserPreferences,
} from "@/lib/services/api/users/preferences.queries";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { SettingsPageHeader } from "./settings-nav";

function PreferenceSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="max-w-xl">
        <label
          htmlFor={id}
          className="block font-sans text-[15px] font-semibold text-ink"
        >
          {label}
        </label>
        <p id={`${id}-description`} className="mt-1 text-sm text-ink-muted">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-description`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function NotificationSettingsPage() {
  const preferencesQuery = useQuery(userPreferencesQueryOptions());
  const whatsappStatusQuery = useQuery({
    ...whatsappStatusQueryOptions(),
    enabled: WHATSAPP_INTEGRATION_ENABLED,
  });

  const telegramStatusQuery = useQuery(telegramStatusQueryOptions());

  const updateMutation = useUpdateUserPreferences();
  const preferences = preferencesQuery.data;
  const controlsDisabled = preferencesQuery.isError || updateMutation.isPending;
  const whatsappLinked = whatsappStatusQuery.data?.linked ?? false;
  const telegramLinked = telegramStatusQuery.data?.linked ?? false;

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        title="Notifikasi & briefing"
        description="Pilih kanal pengiriman pengingat dan briefing harian Sydia."
      />
      {preferencesQuery.isPending ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Memuat preferensi notifikasi"
        >
          {[0, 1].map((row) => (
            <span
              key={row}
              className="block h-24 animate-pulse rounded-lg bg-surface-1 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}
      {preferencesQuery.isError ? (
        <div className="border-y border-destructive/30 py-6" role="alert">
          <p className="text-sm text-destructive">
            {preferencesQuery.error.message}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void preferencesQuery.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      ) : null}
      {preferences ? (
        <>
          <Card className="p-6 sm:p-8" aria-label="Kanal notifikasi">
            <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
              Kanal notifikasi
            </h2>
            <div className="mt-2 divide-y divide-surface-1">
              <PreferenceSwitch
                id="channel-web"
                label="Notifikasi web"
                description="Pengingat dan briefing muncul di aplikasi web Sydia."
                checked={preferences.webNotificationsEnabled}
                disabled={controlsDisabled}
                onChange={(checked) =>
                  updateMutation.mutate({ webNotificationsEnabled: checked })
                }
              />
              <div>
                <PreferenceSwitch
                  id="channel-telegram"
                  label="Notifikasi Telegram"
                  description="Pengingat dan briefing dikirim ke akun Telegram tertaut."
                  checked={
                    preferences.telegramNotificationsEnabled && telegramLinked
                  }
                  disabled={controlsDisabled || !telegramLinked}
                  onChange={(checked) =>
                    updateMutation.mutate({
                      telegramNotificationsEnabled: checked,
                    })
                  }
                />
                {!telegramLinked ? (
                  <p className="pb-4 text-sm text-ink-muted">
                    Tautkan akun Anda di{" "}
                    <Link
                      to="/settings/integrations"
                      className="font-semibold text-link underline underline-offset-2"
                    >
                      pengaturan integrasi
                    </Link>{" "}
                    untuk mengaktifkan kanal ini.
                  </p>
                ) : null}
              </div>
              {WHATSAPP_INTEGRATION_ENABLED ? (
                <div>
                  <PreferenceSwitch
                    id="channel-whatsapp"
                    label="Notifikasi WhatsApp"
                    description="Pengingat dan briefing dikirim ke nomor WhatsApp tertaut."
                    checked={
                      preferences.whatsappNotificationsEnabled && whatsappLinked
                    }
                    disabled={controlsDisabled || !whatsappLinked}
                    onChange={(checked) =>
                      updateMutation.mutate({
                        whatsappNotificationsEnabled: checked,
                      })
                    }
                  />
                  {!whatsappLinked ? (
                    <p className="pb-4 text-sm text-ink-muted">
                      Tautkan nomor Anda di{" "}
                      <Link
                        to="/settings/integrations"
                        className="font-semibold text-link underline underline-offset-2"
                      >
                        pengaturan integrasi
                      </Link>{" "}
                      untuk mengaktifkan kanal ini.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
          <Card className="p-6 sm:p-8" aria-label="Briefing harian">
            <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
              Briefing harian
            </h2>
            <div className="mt-2 divide-y divide-surface-1">
              <PreferenceSwitch
                id="briefing-enabled"
                label="Aktifkan briefing harian"
                description="Sydia mengirim ringkasan tugas, pengingat, dan agenda hari ini pada jam yang Anda pilih."
                checked={preferences.briefingEnabled}
                disabled={controlsDisabled}
                onChange={(checked) =>
                  updateMutation.mutate({ briefingEnabled: checked })
                }
              />
              <div className="py-4">
                <label
                  htmlFor="briefing-time"
                  className="block font-sans text-[15px] font-semibold text-ink"
                >
                  Jam briefing
                </label>
                <p
                  id="briefing-time-description"
                  className="mt-1 text-sm text-ink-muted"
                >
                  Dikirim pada zona waktu profil Anda. Tidak ada pengiriman
                  antara pukul 22.00–08.00.
                </p>
                <input
                  id="briefing-time"
                  type="time"
                  aria-describedby="briefing-time-description"
                  className="mt-3 h-11 rounded-sm border border-ink/16 bg-canvas px-3 font-mono text-[15px] text-ink outline-none hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:bg-ink/4 disabled:opacity-40"
                  value={preferences.briefingTime}
                  disabled={controlsDisabled || !preferences.briefingEnabled}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    updateMutation.mutate({
                      briefingTime: event.target.value,
                    });
                  }}
                />
              </div>
            </div>
          </Card>
        </>
      ) : null}
      {updateMutation.error ? (
        <p className="text-sm text-destructive" role="alert">
          {updateMutation.error.message}
        </p>
      ) : null}
      {updateMutation.isSuccess ? (
        <p
          className="flex items-center gap-2 text-sm text-editorial-deep"
          role="status"
        >
          <CheckCircle2 className="size-4" /> Preferensi notifikasi disimpan.
        </p>
      ) : null}
    </div>
  );
}
