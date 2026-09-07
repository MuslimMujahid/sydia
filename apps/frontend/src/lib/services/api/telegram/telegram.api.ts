import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type TelegramStatus = {
  available: boolean;
  linked: boolean;
  externalId: string | null;
  username: string | null;
  firstName: string | null;
  botUsername: string | null;
  lastInboundAt: string | null;
};

export type TelegramLink = {
  url: string;
  expiresAt: string;
};

const getTelegramStatusServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<TelegramStatus>>(
        "/telegram/status",
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Status Telegram tidak dapat dimuat.");
    }
  }
);

export async function getTelegramStatus(): Promise<TelegramStatus> {
  if (typeof window === "undefined") return getTelegramStatusServer();

  try {
    const response =
      await api.get<ApiResponse<TelegramStatus>>("/telegram/status");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Status Telegram tidak dapat dimuat.");
  }
}

export async function createTelegramLink(): Promise<TelegramLink> {
  try {
    const response =
      await api.post<ApiResponse<TelegramLink>>("/telegram/link");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Tautan Telegram tidak dapat dibuat.");
  }
}

export async function unlinkTelegram(): Promise<void> {
  try {
    await api.delete("/telegram/link");
  } catch (error) {
    throw toApiError(error, "Tautan Telegram tidak dapat diputuskan.");
  }
}
