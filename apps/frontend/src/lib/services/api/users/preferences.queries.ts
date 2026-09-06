import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getUserPreferences, updateUserPreferences } from "./preferences.api";

export const userPreferenceQueryKeys = {
  all: ["user-preferences"] as const,
  current: () => ["user-preferences", "current"] as const,
};

export const userPreferencesQueryOptions = () =>
  queryOptions({
    queryKey: userPreferenceQueryKeys.current(),
    queryFn: getUserPreferences,
    staleTime: 30_000,
  });

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserPreferences,
    onSuccess: (preferences) => {
      queryClient.setQueryData(userPreferenceQueryKeys.current(), preferences);
    },
    meta: { invalidateQueries: [userPreferenceQueryKeys.all] },
  });
}
