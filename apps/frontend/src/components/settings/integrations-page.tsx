import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DomainPageHeader } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError } from "@/components/forms/form-fields";
import { getGoogleCalendarAuthorizationUrl } from "@/lib/services/api/calendar/calendar.api";
import {
  calendarStatusQueryOptions,
  useDisconnectCalendar,
} from "@/lib/services/api/calendar/calendar.queries";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { IntegrationRow } from "./integration-row";
import { WhatsAppIntegrationCard } from "./whatsapp-page";
import { TelegramIntegrationCard } from "./telegram-page";

export type CalendarAuthorizationResult =
  "connected" | "denied" | "failed" | "needs_offline_consent";

type IntegrationSettingsPageProps = {
  calendarAuthorization?: CalendarAuthorizationResult;
};

function GoogleCalendarIntegrationCard({
  calendarAuthorization,
}: IntegrationSettingsPageProps) {
  const statusQuery = useQuery(calendarStatusQueryOptions());
  const status = statusQuery.data;
  const disconnectMutation = useDisconnectCalendar();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const needsReconnect = status?.connectionStatus === "reconnect_required";
  const disconnectPending = status?.connectionStatus === "disconnecting";

  async function handleConnect() {
    setConnectError(null);
    setIsConnecting(true);

    try {
      window.location.assign(await getGoogleCalendarAuthorizationUrl());
    } catch (error) {
      console.error("Google Calendar connection failed", error);
      setConnectError(
        error instanceof Error
          ? error.message
          : "Koneksi Google Calendar tidak dapat dimulai."
      );
      setIsConnecting(false);
    }
  }

  return (
    <IntegrationRow
      id="integration-google-calendar"
      title="Google Calendar"
      account={status?.connected || needsReconnect ? status?.googleEmail : null}
      logoSrc="/images/brands/google-calendar.svg"
      checked={status?.connected === true}
      disabled={
        !status ||
        statusQuery.isError ||
        isConnecting ||
        disconnectMutation.isPending ||
        disconnectPending ||
        (!status.connected && status.available === false)
      }
      onCheckedChange={(checked) => {
        setConnectError(null);
        if (checked) void handleConnect();
        else disconnectMutation.mutate();
      }}
      description="Sinkronkan agenda dengan akun Google Anda."
    >
      {calendarAuthorization === "denied" ? (
        <p className="text-sm text-ink-muted" role="status">
          Izin Google Calendar dibatalkan. Akun Sydia tetap dapat digunakan.
          Aktifkan integrasi untuk mencoba lagi.
        </p>
      ) : null}
      {calendarAuthorization === "failed" ? (
        <FormError message="Google Calendar belum berhasil terhubung. Aktifkan integrasi untuk mencoba lagi, atau lanjutkan tanpa Calendar." />
      ) : null}
      {calendarAuthorization === "needs_offline_consent" ? (
        <FormError message="Google belum memberikan izin untuk sinkronisasi otomatis. Aktifkan integrasi dan setujui izin Google Calendar untuk mencoba lagi." />
      ) : null}
      {statusQuery.isPending ? (
        <p className="text-sm text-ink-muted" role="status">
          Memeriksa koneksi…
        </p>
      ) : null}
      {isConnecting ? (
        <p className="text-sm text-ink-muted" role="status">
          Menghubungkan akun Google…
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
      {needsReconnect ? (
        <p className="text-sm text-ink-muted" role="status">
          Aktifkan kembali untuk menghubungkan ulang akun Google.
        </p>
      ) : null}
      {disconnectPending ? (
        <>
          <p className="text-sm text-ink-muted" role="status">
            Izin Google belum berhasil dicabut. Coba lagi untuk menyelesaikan
            pemutusan.
          </p>
          <Button
            variant="dark-outline"
            size="sm"
            disabled={disconnectMutation.isPending}
            onClick={() => disconnectMutation.mutate()}
          >
            {disconnectMutation.isPending
              ? "Mencoba lagi…"
              : "Coba cabut izin lagi"}
          </Button>
        </>
      ) : null}
      {status?.available === false && !status.connected ? (
        <p className="text-sm text-ink-muted" role="status">
          Integrasi Google belum tersedia di server ini.
        </p>
      ) : null}
      {connectError ? <FormError message={connectError} /> : null}
      {disconnectMutation.error ? (
        <FormError message={disconnectMutation.error.message} />
      ) : null}
    </IntegrationRow>
  );
}

export function IntegrationSettingsPage({
  calendarAuthorization,
}: IntegrationSettingsPageProps) {
  return (
    <div className="max-w-3xl space-y-6 lg:space-y-10">
      <DomainPageHeader title="Integrasi" divided={false} />
      <Card className="p-6 sm:p-8" aria-label="Layanan integrasi">
        <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
          Layanan
        </h2>
        <div className="mt-4 divide-y divide-surface-1">
          {WHATSAPP_INTEGRATION_ENABLED ? <WhatsAppIntegrationCard /> : null}
          <TelegramIntegrationCard />
          <GoogleCalendarIntegrationCard
            calendarAuthorization={calendarAuthorization}
          />
        </div>
      </Card>
    </div>
  );
}
