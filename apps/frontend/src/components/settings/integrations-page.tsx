import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Unplug } from "lucide-react";
import { DomainPageHeader } from "@/components/domain/domain-page";
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
  getGoogleCalendarAuthorizationUrl,
  type CalendarConflictSnapshot,
} from "@/lib/services/api/calendar/calendar.api";
import {
  calendarConflictsQueryOptions,
  calendarStatusQueryOptions,
  googleCalendarsQueryOptions,
  useDisconnectCalendar,
  useResolveCalendarConflict,
  useSelectGoogleCalendar,
} from "@/lib/services/api/calendar/calendar.queries";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { WhatsAppIntegrationCard } from "./whatsapp-page";
import { TelegramIntegrationCard } from "./telegram-page";

function conflictDate(snapshot: CalendarConflictSnapshot): string | null {
  if (snapshot.allDayStartDate && snapshot.allDayEndDate) {
    const start = new Date(snapshot.allDayStartDate);
    const exclusiveEnd = new Date(snapshot.allDayEndDate);
    const lastDay = new Date(exclusiveEnd.getTime() - 24 * 60 * 60 * 1000);
    const format = (date: Date) =>
      date.toLocaleDateString("id-ID", {
        dateStyle: "medium",
        timeZone: "UTC",
      });

    return start.getTime() === lastDay.getTime()
      ? format(start)
      : `${format(start)} – ${format(lastDay)}`;
  }

  if (snapshot.startAt && snapshot.endAt) {
    const format = (value: string) =>
      new Date(value).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        ...(snapshot.timezone ? { timeZone: snapshot.timezone } : {}),
      });

    return `${format(snapshot.startAt)} – ${format(snapshot.endAt)}`;
  }

  return null;
}

const conflictFieldLabels: Record<string, string> = {
  title: "judul",
  description: "deskripsi",
  location: "lokasi",
  startAt: "waktu mulai",
  endAt: "waktu selesai",
  timezone: "zona waktu",
  allDayStartDate: "tanggal mulai",
  allDayEndDate: "tanggal selesai",
  recurrence: "pengulangan",
  attendees: "peserta",
  status: "status",
  event: "acara",
};

function CalendarConflictReview({ connected }: { connected: boolean }) {
  const conflictsQuery = useQuery(calendarConflictsQueryOptions());
  const resolveMutation = useResolveCalendarConflict();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resolve(
    conflict: NonNullable<typeof conflictsQuery.data>[number],
    resolution: "keep_sydia" | "use_google"
  ) {
    setErrorMessage(null);
    resolveMutation.mutate(
      {
        conflictId: conflict.id,
        resolution,
        expectedLocalRevision: conflict.localRevision,
        expectedRemoteEtag: conflict.remoteEtag,
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onError: (error: Error) => setErrorMessage(error.message),
      }
    );
  }

  return (
    <section
      className="mt-5 border-t border-ink/8 pt-5"
      aria-labelledby="calendar-conflicts-title"
    >
      <h3 id="calendar-conflicts-title" className="font-semibold text-ink">
        Tinjau perubahan acara
      </h3>
      {conflictsQuery.isPending ? (
        <p className="mt-2 text-sm text-ink-muted" role="status">
          Memuat perubahan…
        </p>
      ) : null}
      {conflictsQuery.isError ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {conflictsQuery.error.message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {conflictsQuery.data?.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted" role="status">
          Tidak ada perubahan yang perlu ditinjau.
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {conflictsQuery.data?.map((conflict) => {
          const remote = conflict.remote;
          const remoteTitle = conflict.remoteDeleted
            ? "Acara dihapus di Google Calendar"
            : (remote?.title ?? "Versi Google tidak tersedia");

          return (
            <li
              key={conflict.id}
              className="rounded-lg border border-ink/8 p-4"
            >
              <p className="text-sm font-semibold text-ink">{conflict.title}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Berbeda pada{" "}
                {conflict.fields
                  .map((field) => conflictFieldLabels[field] ?? field)
                  .join(", ")}
              </p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Sydia
                  </p>
                  <p className="mt-1 text-ink">
                    {conflict.local.title ?? conflict.title}
                  </p>
                  {conflictDate(conflict.local) ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      {conflictDate(conflict.local)}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Google Calendar
                  </p>
                  <p className="mt-1 text-ink">{remoteTitle}</p>
                  {remote && conflictDate(remote) ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      {conflictDate(remote)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="dark-outline"
                  disabled={!connected || resolveMutation.isPending}
                  onClick={() => resolve(conflict, "keep_sydia")}
                >
                  Pertahankan versi Sydia
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!connected || !remote || resolveMutation.isPending}
                  onClick={() => resolve(conflict, "use_google")}
                >
                  Gunakan versi Google
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GoogleCalendarIntegrationCard() {
  const statusQuery = useQuery(calendarStatusQueryOptions());
  const status = statusQuery.data;
  const calendarsQuery = useQuery(
    googleCalendarsQueryOptions(status?.connected === true)
  );

  const disconnectMutation = useDisconnectCalendar();
  const selectCalendarMutation = useSelectGoogleCalendar();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const needsReconnect = status?.connectionStatus === "reconnect_required";
  const disconnectPending = status?.connectionStatus === "disconnecting";
  const syncError = status?.lastErrorCode;
  const lastSyncedLabel = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

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

  function handleDisconnect() {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => setDialogOpen(false),
    });
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
                {needsReconnect
                  ? "Perlu dihubungkan ulang"
                  : disconnectPending
                    ? "Pencabutan izin tertunda"
                    : status.connected
                      ? status.bindingState === "initializing"
                        ? "Menyiapkan sinkronisasi"
                        : "Terhubung"
                      : "Belum terhubung"}
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
                ? `Sinkronisasi dua arah dengan ${status.calendarName ?? status.calendarId ?? "kalender Google"}${status.googleEmail ? ` · ${status.googleEmail}` : ""}.`
                : disconnectPending
                  ? "Sinkronisasi Sydia sudah dihentikan. Izin Google belum berhasil dicabut; coba lagi untuk menyelesaikan pemutusan."
                  : needsReconnect
                    ? "Sydia menyimpan acara yang sudah tersinkron. Hubungkan kembali Google untuk melanjutkan sinkronisasi."
                    : "Hubungkan untuk menyinkronkan agenda Anda. Agenda lokal Sydia tetap berfungsi tanpa koneksi."}
            </p>
          ) : null}
          {status?.connected ? (
            <div className="mt-4 max-w-md space-y-2">
              <label
                htmlFor="google-calendar-selection"
                className="block text-sm font-medium text-ink"
              >
                Kalender tersinkron
              </label>
              <select
                id="google-calendar-selection"
                className="w-full rounded-md border border-ink/12 bg-canvas px-3 py-2 text-sm text-ink shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-deep/30"
                value={status.calendarId ?? ""}
                disabled={
                  calendarsQuery.isPending ||
                  selectCalendarMutation.isPending ||
                  status.bindingState === "initializing"
                }
                onChange={(event) => {
                  const calendarId = event.currentTarget.value;
                  if (!calendarId || calendarId === status.calendarId) return;

                  setSelectionError(null);
                  selectCalendarMutation.mutate(
                    { calendarId },
                    {
                      onError: (error: Error) =>
                        setSelectionError(error.message),
                    }
                  );
                }}
              >
                {calendarsQuery.data?.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                    {calendar.primary ? " · utama" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-ink-muted">
                Beralih kalender menghentikan sinkronisasi kalender sebelumnya.
                Acara tersimpan dan perubahan tertunda tetap ada di Sydia; pilih
                kalender itu lagi untuk melanjutkan.
              </p>
              {calendarsQuery.isPending ? (
                <p className="text-xs text-ink-muted" role="status">
                  Memuat kalender yang dapat ditulis…
                </p>
              ) : null}
              {calendarsQuery.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {calendarsQuery.error.message}
                </p>
              ) : null}
              {selectionError ? (
                <p className="text-sm text-destructive" role="alert">
                  {selectionError}
                </p>
              ) : null}
              {selectCalendarMutation.isPending ? (
                <p className="text-xs text-ink-muted" role="status">
                  Mengganti kalender dan menyiapkan sinkronisasi…
                </p>
              ) : null}
            </div>
          ) : null}
          {status?.connected && status.bindingState === "initializing" ? (
            <p className="mt-2 text-sm text-ink-muted" role="status">
              Sydia sedang memuat acara dari Google Calendar.
            </p>
          ) : null}
          {status?.connected && lastSyncedLabel ? (
            <p className="mt-2 text-sm text-ink-muted">
              Terakhir disinkronkan {lastSyncedLabel}.
            </p>
          ) : null}
          {status?.connected && status.pendingOperationCount > 0 ? (
            <p className="mt-2 text-sm text-ink-muted" role="status">
              {status.pendingOperationCount} perubahan menunggu sinkronisasi.
            </p>
          ) : null}
          {status?.connected && status.openConflictCount > 0 ? (
            <>
              <p className="mt-2 text-sm text-destructive" role="status">
                {status.openConflictCount} acara memiliki perubahan yang perlu
                ditinjau.
              </p>
              <CalendarConflictReview connected={status.connected} />
            </>
          ) : null}
          {needsReconnect || syncError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {needsReconnect
                ? "Izin Google kedaluwarsa atau berubah. Hubungkan ulang untuk melanjutkan sinkronisasi."
                : "Sinkronisasi Google mengalami kendala. Sydia akan mencoba lagi."}
            </p>
          ) : null}
        </div>
        {disconnectPending ? (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Button
              size="sm"
              variant="dark-outline"
              disabled={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate()}
            >
              {disconnectMutation.isPending
                ? "Mencoba lagi…"
                : "Coba cabut izin lagi"}
            </Button>
            {disconnectMutation.error ? (
              <span className="max-w-56 text-sm text-destructive" role="alert">
                {disconnectMutation.error.message}
              </span>
            ) : null}
          </div>
        ) : status?.connected ? (
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
            {isConnecting
              ? "Menghubungkan…"
              : needsReconnect
                ? "Hubungkan ulang"
                : "Hubungkan Google"}
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
    <div className="max-w-3xl space-y-6 lg:space-y-10">
      <DomainPageHeader title="Integrasi" divided={false} />
      {WHATSAPP_INTEGRATION_ENABLED ? <WhatsAppIntegrationCard /> : null}
      <TelegramIntegrationCard />
      <GoogleCalendarIntegrationCard />
    </div>
  );
}
