import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getCurrentUser,
  getUserPreferences,
  updateCurrentUser,
  updateUserPreferences,
} from "./users.api";

export const userQueryKeys = {
  all: ["users"] as const,
  current: () => ["users", "current"] as const,
  preferences: () => ["users", "preferences"] as const,
};

export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: userQueryKeys.current(),
    queryFn: getCurrentUser,
    staleTime: 30_000,
  });

export const userPreferencesQueryOptions = () =>
  queryOptions({
    queryKey: userQueryKeys.preferences(),
    queryFn: getUserPreferences,
    staleTime: 60_000,
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

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserPreferences,
    onSuccess: (preferences) => {
      queryClient.setQueryData(userQueryKeys.preferences(), preferences);
    },
    meta: { invalidateQueries: [userQueryKeys.preferences()] },
  });
}
