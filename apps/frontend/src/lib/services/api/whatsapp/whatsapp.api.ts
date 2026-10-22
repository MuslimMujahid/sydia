import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
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

const getWhatsAppStatusServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<WhatsAppStatus>>(
        "/whatsapp/status",
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Status WhatsApp tidak dapat dimuat.");
    }
  }
);

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  if (typeof window === "undefined") return getWhatsAppStatusServer();

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

export async function getWhatsAppQrAsset(attemptId: string): Promise<Blob> {
  try {
    return (
      await api.get<Blob>(
        `/whatsapp/companion/qr/${encodeURIComponent(attemptId)}`,
        { responseType: "blob" }
      )
    ).data;
  } catch (error) {
    throw toApiError(
      error,
      "Gambar QR tidak dapat dimuat. Coba muat kode baru."
    );
  }
}

export async function unlinkWhatsApp(): Promise<void> {
  try {
    await api.delete("/whatsapp/link");
  } catch (error) {
    throw toApiError(error, "Koneksi WhatsApp tidak dapat diputuskan.");
  }
}
