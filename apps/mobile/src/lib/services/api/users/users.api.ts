import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type SupportedLocale = "en" | "id";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  locale: SupportedLocale;
  onboardingCompleted: boolean;
  image?: string | null;
  role: string;
};

export type UpdateUserProfileVariables = {
  name: string;
  timezone: string;
  locale: SupportedLocale;
  onboardingCompleted: boolean;
};

export const ASSISTANT_PERSONAS = [
  "professional",
  "friendly",
  "cheerful",
  "playful",
] as const;

export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

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

export async function getCurrentUser(): Promise<UserProfile> {
  try {
    const response = await api.get<ApiResponse<UserProfile>>("/users/me");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Profil Anda tidak dapat dimuat.");
  }
}

export async function updateCurrentUser(
  values: UpdateUserProfileVariables
): Promise<UserProfile> {
  try {
    const response = await api.patch<ApiResponse<UserProfile>>(
      "/users/me",
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Profil Anda tidak dapat disimpan.");
  }
}

export async function getUserPreferences(): Promise<UserPreferences> {
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
