import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Unplug } from "lucide-react";
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
import { getGoogleCalendarAuthorizationUrl } from "@/lib/services/api/calendar/calendar.api";
import {
  calendarStatusQueryOptions,
  useDisconnectCalendar,
} from "@/lib/services/api/calendar/calendar.queries";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { WhatsAppIntegrationCard } from "./whatsapp-page";
import { TelegramIntegrationCard } from "./telegram-page";
import { SettingsPageHeader } from "./settings-nav";

function GoogleCalendarIntegrationCard() {
  const statusQuery = useQuery(calendarStatusQueryOptions());
  const disconnectMutation = useDisconnectCalendar();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const status = statusQuery.data;

  async function handleConnect() {
    setConnectError(null);
    setIsConnecting(true);

    try {
      window.location.assign(await getGoogleCalendarAuthorizationUrl());
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Koneksi Google Calendar tidak dapat dimulai."
      );
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectMutation.mutateAsync();
    setDialogOpen(false);
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
              <CalendarDays className="size-5 text-brand-deep" /> Google
              Calendar
            </h2>
            {status ? (
              <span className="text-sm font-semibold text-ink-muted">
                {status.connected ? "Terhubung" : "Belum terhubung"}
              </span>
            ) : null}
          </div>
          {statusQuery.isPending ? (
            <p className="mt-2 text-sm text-ink-muted" role="status">
              Memeriksa koneksi…
            </p>
          ) : null}
          {statusQuery.isError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {statusQuery.error.message}
            </p>
          ) : null}
          {status ? (
            <p className="mt-2 text-sm leading-[1.6] text-ink-muted">
              {status.connected
                ? `Sinkronisasi dua arah dengan${status.calendarId ? ` ${status.calendarId}` : " kalender Google Anda"}.`
                : "Hubungkan untuk menyinkronkan agenda Anda. Agenda lokal Sydia tetap berfungsi tanpa koneksi."}
            </p>
          ) : null}
        </div>
        {status?.connected ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="dark-outline" size="sm" className="shrink-0" />
              }
            >
              <Unplug /> Putuskan
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Putuskan Google Calendar?</DialogTitle>
              <DialogDescription className="mt-3">
                Sinkronisasi berhenti dan izin Google dicabut. Acara yang sudah
                tersimpan di Sydia tidak ikut terhapus.
              </DialogDescription>
              {disconnectMutation.error ? (
                <div className="mt-4">
                  <FormError message={disconnectMutation.error.message} />
                </div>
              ) : null}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disconnectMutation.isPending}
                  onClick={() => setDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={disconnectMutation.isPending}
                  onClick={() => void handleDisconnect()}
                >
                  {disconnectMutation.isPending
                    ? "Memutuskan…"
                    : "Ya, putuskan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            disabled={status?.available === false || isConnecting}
            onClick={() => void handleConnect()}
          >
            {isConnecting ? "Menghubungkan…" : "Hubungkan Google"}
          </Button>
        )}
      </div>
      {status?.available === false ? (
        <p className="mt-4 text-sm text-ink-muted" role="status">
          Integrasi Google belum tersedia di server ini.
        </p>
      ) : null}
      {connectError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {connectError}
        </p>
      ) : null}
    </Card>
  );
}

export function IntegrationSettingsPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Integrasi"
        title="Integrasi"
        description="Kanal pesan dan layanan yang terhubung ke akun Sydia. Mencabut tautan menghentikan pesan dan sinkronisasi tanpa menghapus data yang sudah tersimpan."
      />
      {WHATSAPP_INTEGRATION_ENABLED ? <WhatsAppIntegrationCard /> : null}
      <TelegramIntegrationCard />
      <GoogleCalendarIntegrationCard />
    </div>
  );
}
