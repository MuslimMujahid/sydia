import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export const ASSISTANT_PERSONAS = [
  "professional",
  "friendly",
  "cheerful",
  "playful",
] as const;

export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

export const DEFAULT_ASSISTANT_PERSONA: AssistantPersona = "professional";

/** How the user describes themselves; picks the example messages they see. */
export const USER_OCCUPATIONS = [
  "homemaker",
  "school_student",
  "university_student",
  "office_worker",
  "freelancer",
  "business_owner",
  "other",
] as const;

export type UserOccupation = (typeof USER_OCCUPATIONS)[number];

export const OCCUPATION_LABELS: Record<UserOccupation, string> = {
  homemaker: "Ibu rumah tangga",
  school_student: "Pelajar / anak sekolah",
  university_student: "Mahasiswa",
  office_worker: "Pekerja kantoran",
  freelancer: "Freelancer",
  business_owner: "Pedagang / pemilik usaha",
  other: "Lainnya",
};
export type UserPreferences = {
  automaticMemoryEnabled: boolean;
  persona: AssistantPersona;
  preferredAddress: string | null;
  occupation: UserOccupation | null;
  briefingEnabled: boolean;
  weeklyBriefingEnabled: boolean;
  /** ISO weekday: Monday = 1, Sunday = 7. */
  weeklyBriefingDay: number;
  briefingTime: string;
  followUpIntervalMinutes: 30 | 60 | 120 | 180;
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
