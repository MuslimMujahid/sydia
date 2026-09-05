import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
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
};

export type UpdateUserProfileVariables = {
  name: string;
  timezone: string;
  locale: SupportedLocale;
  onboardingCompleted: boolean;
};

export const userQueryKeys = {
  all: ["users"] as const,
  current: () => ["users", "current"] as const,
};

const getCurrentUserServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<UserProfile>>("/users/me", {
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Profil Anda tidak dapat dimuat.");
    }
  }
);

async function getCurrentUser(): Promise<UserProfile> {
  if (typeof window === "undefined") return getCurrentUserServer();

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

export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: userQueryKeys.current(),
    queryFn: getCurrentUser,
    staleTime: 30_000,
    retry: false,
  });

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCurrentUser,
    onSuccess: (user) => {
      queryClient.setQueryData(userQueryKeys.current(), user);
    },
    meta: { invalidateQueries: [userQueryKeys.current()] },
  });
}
