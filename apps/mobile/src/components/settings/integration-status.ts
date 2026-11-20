import type { CalendarStatus } from "@/lib/services/api/calendar/calendar.api";
import type { TelegramStatus } from "@/lib/services/api/telegram/telegram.api";
import type {
  WhatsAppLinkCode,
  WhatsAppQr,
  WhatsAppStatus,
} from "@/lib/services/api/whatsapp/whatsapp.api";

/** "4:05" for a remaining duration; never negative. */
export function formatCountdown(millisecondsLeft: number): string {
  const seconds = Math.max(0, Math.floor(millisecondsLeft / 1000));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "@sydia_user", the first name, or null when nothing identifies the account. */
export function telegramAccountLabel(
  status: Pick<TelegramStatus, "username" | "firstName"> | undefined
): string | null {
  if (status?.username) return `@${status.username.replace(/^@/, "")}`;

  return status?.firstName || null;
}

export function telegramSummary(status: TelegramStatus | undefined): string {
  if (!status) return "Memeriksa koneksi…";
  if (status.linked) return telegramAccountLabel(status) ?? "Terhubung";
  if (!status.available) return "Belum tersedia";

  return "Belum terhubung";
}

export type WhatsAppView = {
  label: string;
  isPairing: boolean;
  ownerConflict: boolean;
  ownerVerification: boolean;
  expiredQr: boolean;
  expiredCode: boolean;
};

/**
 * The setup phase the screen shows, derived exactly like the web's
 * WhatsAppIntegrationCard: QR pairing first, then owner verification.
 */
export function deriveWhatsAppView(
  status: WhatsAppStatus | undefined,
  local: {
    attempt: WhatsAppQr | null;
    code: WhatsAppLinkCode | null;
    qrPending: boolean;
    now: number;
  }
): WhatsAppView {
  const expiredQr =
    Boolean(
      local.attempt && Date.parse(local.attempt.expiresAt) <= local.now
    ) || status?.setupPhase === "qr_expired";

  const challengeExpiresAt =
    local.code?.expiresAt ?? status?.ownerCodeExpiresAt;
  const expiredCode = Boolean(
    challengeExpiresAt && Date.parse(challengeExpiresAt) <= local.now
  );

  const isPairing = Boolean(
    !status?.assistantNumber &&
    (local.attempt ||
      local.qrPending ||
      expiredQr ||
      status?.setupPhase === "qr_error" ||
      status?.setupPhase === "pairing")
  );

  const ownerConflict = status?.setupPhase === "owner_conflict";
  const ownerVerification =
    status?.setupPhase === "owner_verification" || ownerConflict;

  const label = status?.connected
    ? "Terhubung"
    : status?.status === "enforced"
      ? "Pengiriman dibatasi"
      : status?.status === "logged_out"
        ? "Sesi berakhir"
        : status?.linked
          ? "Koneksi terputus"
          : ownerConflict
            ? "Nomor pribadi masih tertaut ke akun lain"
            : ownerVerification
              ? expiredCode
                ? `Verifikasi kedaluwarsa · +${status?.assistantNumber ?? ""}`
                : "Akun asisten tertaut · Verifikasi nomor pribadi"
              : isPairing
                ? "Menunggu pemindaian QR"
                : "Belum terhubung";

  return {
    label,
    isPairing,
    ownerConflict,
    ownerVerification,
    expiredQr,
    expiredCode,
  };
}

/** Short status for the integrations hub row. */
export function whatsappSummary(status: WhatsAppStatus | undefined): string {
  if (!status) return "Memeriksa koneksi…";

  return deriveWhatsAppView(status, {
    attempt: null,
    code: null,
    qrPending: false,
    now: Date.now(),
  }).label;
}

export type CalendarConnection =
  "connected" | "reconnect" | "disconnecting" | "unavailable" | "disconnected";

export function calendarConnection(
  status: CalendarStatus | undefined
): CalendarConnection {
  if (!status) return "disconnected";
  if (status.connectionStatus === "reconnect_required") return "reconnect";
  if (status.connectionStatus === "disconnecting") return "disconnecting";
  if (status.connected) return "connected";
  if (status.available === false) return "unavailable";

  return "disconnected";
}

export function calendarSummary(status: CalendarStatus | undefined): string {
  switch (calendarConnection(status)) {
    case "connected":
      return status?.googleEmail ?? "Terhubung";
    case "reconnect":
      return "Sinkronisasi dijeda";
    case "disconnecting":
      return "Sedang diputuskan";
    case "unavailable":
      return "Belum tersedia";
    default:
      return "Belum terhubung";
  }
}

/** wa.me link that opens a chat with the assistant, message prefilled. */
export function whatsappMessageUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
