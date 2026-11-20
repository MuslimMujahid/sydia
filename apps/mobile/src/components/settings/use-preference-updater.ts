import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import type {
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@/lib/services/api/users/users.api";
import {
  useUpdateUserPreferences,
  userQueryKeys,
} from "@/lib/services/api/users/users.queries";

/**
 * Saves preference toggles immediately. The cached preferences change first
 * so the control responds at once; a failure restores them and says why.
 */
export function usePreferenceUpdater() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useUpdateUserPreferences();

  async function update(
    values: UpdateUserPreferencesInput,
    options: { successMessage?: string } = {}
  ): Promise<boolean> {
    const key = userQueryKeys.preferences();
    const previous = queryClient.getQueryData<UserPreferences>(key);
    if (previous)
      queryClient.setQueryData<UserPreferences>(key, {
        ...previous,
        ...values,
      });

    try {
      await mutation.mutateAsync(values);
      if (options.successMessage) toast(options.successMessage);

      return true;
    } catch (error) {
      console.warn("Preference update failed", error);
      if (previous) queryClient.setQueryData(key, previous);
      toast(
        error instanceof Error && error.message
          ? error.message
          : "Preferensi tidak dapat disimpan.",
        { tone: "error" }
      );

      return false;
    }
  }

  return { update, isPending: mutation.isPending };
}
