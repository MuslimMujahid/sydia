import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export const ASSISTANT_PERSONAS = [
  "professional",
  "casual",
  "supportive",
  "firm",
  "motivator",
] as const;

export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

export const DEFAULT_ASSISTANT_PERSONA: AssistantPersona = "supportive";

export const ASSISTANT_VERBOSITIES = [
  "concise",
  "balanced",
  "detailed",
] as const;

export type AssistantVerbosity = (typeof ASSISTANT_VERBOSITIES)[number];

export const DEFAULT_ASSISTANT_VERBOSITY: AssistantVerbosity = "balanced";

export const RETENTION_DAY_OPTIONS = [30, 90, 180, 365] as const;

export type UserPreferences = {
  automaticMemoryEnabled: boolean;
  persona: AssistantPersona;
  assistantStyle: AssistantPersona;
  assistantVerbosity: AssistantVerbosity;
  briefingEnabled: boolean;
  briefingTime: string;
  webNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  proactivePaused: boolean;
  retentionDays: number;
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
