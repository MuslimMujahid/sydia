import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type WhatsAppStatus = {
  connected: boolean;
  linked: boolean;
  setupPhase:
    | "disconnected"
    | "pairing"
    | "qr_error"
    | "qr_expired"
    | "owner_verification"
    | "owner_conflict"
    | "ready"
    | "conflict"
    | "revoked";
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "awaiting_pair"
    | "enforced"
    | "logged_out";
  assistantNumber: string | null;
  ownerNumber: string | null;
  reason: string | null;
  ownerCodeExpiresAt: string | null;
  qrExpiresAt: string | null;
};
export type WhatsAppLinkCode = { code: string; expiresAt: string };
export type WhatsAppQr = {
  attemptId: string;
  expiresAt: string;
  assetPath: string;
};

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  try {
    return (await api.get<ApiResponse<WhatsAppStatus>>("/whatsapp/status")).data
      .data;
  } catch (error) {
    throw toApiError(error, "Status WhatsApp tidak dapat dimuat.");
  }
}

async function connectionPost<T>(
  path: string,
  failure: string,
  data?: { refresh: boolean }
): Promise<T> {
  try {
    return (await api.post<ApiResponse<T>>(path, data)).data.data;
  } catch (error) {
    throw toApiError(error, failure);
  }
}

export function createWhatsAppLinkCode() {
  return connectionPost<WhatsAppLinkCode>(
    "/whatsapp/link-code",
    "Pesan verifikasi tidak dapat dibuat."
  );
}

export function createWhatsAppQr(input?: { refresh: boolean }) {
  return connectionPost<WhatsAppQr>(
    "/whatsapp/companion/qr",
    "Kode QR tidak dapat dimuat. Coba lagi.",
    input
  );
}

export function replaceWhatsAppOwner() {
  return connectionPost<WhatsAppLinkCode>(
    "/whatsapp/owner/replace",
    "Nomor pribadi belum dapat diganti."
  );
}

export function reconnectWhatsApp() {
  return connectionPost<WhatsAppStatus>(
    "/whatsapp/reconnect",
    "WhatsApp belum dapat tersambung kembali."
  );
}

/** QR image URL; load it with the session cookie (see authHeaders). */
export function getWhatsAppQrAssetUrl(attemptId: string): string {
  const baseUrl = String(api.defaults.baseURL ?? "").replace(/\/$/, "");

  return `${baseUrl}/whatsapp/companion/qr/${encodeURIComponent(attemptId)}`;
}

export async function unlinkWhatsApp(): Promise<void> {
  try {
    await api.delete("/whatsapp/link");
  } catch (error) {
    throw toApiError(error, "Koneksi WhatsApp tidak dapat diputuskan.");
  }
}
