import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type WhatsAppGatewayState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "awaiting_pair"
  | "enforced"
  | "logged_out";

export type WhatsAppGatewayStatus = {
  status: WhatsAppGatewayState;
  registrationReady: boolean;
  profileReady: boolean;
  sendingPaused: boolean;
  enforcementCode: string | null;
  enforcementReason: string | null;
  recoveryReason: string | null;
  lastConnectedAt: string | null;
  lastEventAt: string | null;
};

export type WhatsAppContact = {
  firstInboundAt: string | null;
  firstResponseAt: string | null;
  optedOutAt: string | null;
  lastInboundAt: string | null;
  lastProactiveSentAt: string | null;
  lastProactiveReplyAt: string | null;
  unansweredProactiveCount: number;
};

export type WhatsAppStatus = {
  gateway: WhatsAppGatewayStatus;
  linked: boolean;
  externalId: string | null;
  contact: WhatsAppContact | null;
};

export type WhatsAppLinkCode = {
  code: string;
  expiresAt: string;
};

export type WhatsAppCompanionPairCode = {
  code: string;
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
    const response =
      await api.get<ApiResponse<WhatsAppStatus>>("/whatsapp/status");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Status WhatsApp tidak dapat dimuat.");
  }
}

export async function createWhatsAppLinkCode(): Promise<WhatsAppLinkCode> {
  try {
    const response = await api.post<ApiResponse<WhatsAppLinkCode>>(
      "/whatsapp/link-code"
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kode tautan WhatsApp tidak dapat dibuat.");
  }
}

export async function pairWhatsAppCompanion(
  phone: string
): Promise<WhatsAppCompanionPairCode> {
  try {
    const response = await api.post<ApiResponse<WhatsAppCompanionPairCode>>(
      "/whatsapp/companion/pair-code",
      { phone }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(
      error,
      "Kode pairing nomor WhatsApp Sydia tidak dapat dibuat."
    );
  }
}

export async function unlinkWhatsApp(): Promise<void> {
  try {
    await api.delete("/whatsapp/link");
  } catch (error) {
    throw toApiError(error, "Tautan WhatsApp tidak dapat diputuskan.");
  }
}
