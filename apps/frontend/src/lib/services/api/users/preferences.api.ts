import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export const ASSISTANT_PERSONAS = [
  "professional",
  "friendly",
  "cheerful",
  "calm",
  "playful",
] as const;

export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

export const DEFAULT_ASSISTANT_PERSONA: AssistantPersona = "professional";
export type UserPreferences = {
  automaticMemoryEnabled: boolean;
  persona: AssistantPersona;
  preferredAddress: string | null;
  briefingEnabled: boolean;
  briefingTime: string;
  webNotificationsEnabled: boolean;
  telegramNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
};

export type UpdateUserPreferencesInput = Partial<UserPreferences>;

const getUserPreferencesServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<UserPreferences>>(
        "/users/me/preferences",
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Preferensi asisten tidak dapat dimuat.");
    }
  }
);

export async function getUserPreferences(): Promise<UserPreferences> {
  if (typeof window === "undefined") return getUserPreferencesServer();

  try {
    const response = await api.get<ApiResponse<UserPreferences>>(
      "/users/me/preferences"
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Preferensi asisten tidak dapat dimuat.");
  }
}

export async function updateUserPreferences(
  values: UpdateUserPreferencesInput
): Promise<UserPreferences> {
  try {
    const response = await api.patch<ApiResponse<UserPreferences>>(
      "/users/me/preferences",
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Preferensi asisten tidak dapat disimpan.");
  }
}
