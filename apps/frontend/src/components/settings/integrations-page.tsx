import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MessageSquareText, Send, Unplug } from "lucide-react";
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
import { getGoogleCalendarAuthorizationUrl } from "@/lib/services/api/calendar/calendar.api";
import {
  calendarStatusQueryOptions,
  useDisconnectCalendar,
} from "@/lib/services/api/calendar/calendar.queries";
import { whatsappStatusQueryOptions } from "@/lib/services/api/whatsapp/whatsapp.queries";
import { telegramStatusQueryOptions } from "@/lib/services/api/telegram/telegram.queries";
import { SettingsPageHeader } from "./settings-nav";

function TelegramIntegrationCard() {
  const statusQuery = useQuery(telegramStatusQueryOptions());
  const status = statusQuery.data;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
            <Send className="size-5 text-brand-deep" /> Telegram
          </h2>
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
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge dot={status.linked ? "brand" : "ink-weak"}>
                  {status.linked ? "Tertaut" : "Belum tertaut"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                {status.linked
                  ? `Terhubung ke ${status.username ? `@${status.username}` : (status.firstName ?? "akun Anda")}. Pesan dan balasan berjalan melalui bot Telegram Sydia.`
                  : "Tautkan akun Anda untuk mengobrol dengan Sydia lewat Telegram."}
              </p>
            </>
          ) : null}
        </div>
        <Button
          variant="dark-outline"
          size="sm"
          nativeButton={false}
          className="shrink-0"
          render={<Link to="/settings/telegram" />}
        >
          Kelola Telegram
        </Button>
      </div>
      {status?.available === false ? (
        <p className="mt-4 text-sm text-ink-muted">
          Integrasi Telegram belum tersedia di server ini.
        </p>
      ) : null}
    </Card>
  );
}

function WhatsAppIntegrationCard() {
  const statusQuery = useQuery(whatsappStatusQueryOptions());
  const status = statusQuery.data;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
            <MessageSquareText className="size-5 text-brand-deep" /> WhatsApp
          </h2>
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
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge dot={status.linked ? "brand" : "ink-weak"}>
                  {status.linked ? "Tertaut" : "Belum tertaut"}
                </Badge>
                {status.gateway.enforcementReason ||
                status.gateway.sendingPaused ? (
                  <Badge dot="destructive">Pengiriman dijeda</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                {status.linked
                  ? `Terhubung ke ${status.externalId ? status.externalId.split("@")[0]?.split(":")[0] : "nomor Anda"}. Pengingat dan balasan berjalan melalui WhatsApp.`
                  : "Tautkan nomor Anda untuk membalas dan menerima pengingat lewat WhatsApp."}
              </p>
            </>
          ) : null}
        </div>
        <Button
          variant="dark-outline"
          size="sm"
          nativeButton={false}
          className="shrink-0"
          render={<Link to="/settings/whatsapp" />}
        >
          Kelola WhatsApp
        </Button>
      </div>
    </Card>
  );
}

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
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
            <CalendarDays className="size-5 text-brand-deep" /> Google Calendar
          </h2>
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
            <p className="mt-2 text-sm text-ink-muted">
              {status.connected
                ? `Terhubung${status.calendarId ? ` ke ${status.calendarId}` : ""}. Acara disinkronkan dua arah.`
                : "Belum terhubung. Agenda lokal Sydia tetap berfungsi."}
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
        <p className="mt-4 text-sm text-ink-muted">
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
        description="Layanan yang terhubung ke akun Sydia Anda. Mencabut integrasi menghentikan sinkronisasi tanpa menghapus data yang sudah tersimpan."
      />
      <WhatsAppIntegrationCard />
      <TelegramIntegrationCard />
      <GoogleCalendarIntegrationCard />
    </div>
  );
}
