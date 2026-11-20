import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PersonaPicker } from "@/components/onboarding/persona-picker";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { usePreferenceUpdater } from "@/components/settings/use-preference-updater";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection, SwitchRow } from "@/components/ui/list";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import {
  OCCUPATION_LABELS,
  USER_OCCUPATIONS,
  type UserPreferences,
} from "@/lib/services/api/users/users.api";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/users.queries";

export default function AssistantSettingsScreen() {
  const query = useQuery(userPreferencesQueryOptions());
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        title="Preferensi tidak dapat dimuat"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return <AssistantPreferences preferences={query.data} />;
}

function AssistantPreferences({
  preferences,
}: {
  preferences: UserPreferences;
}) {
  const updater = usePreferenceUpdater();
  const showActions = useActionSheet();
  const [address, setAddress] = useState(preferences.preferredAddress ?? "");

  return (
    <SettingsScroll>
      <Text variant="headline" accessibilityRole="header">
        Gaya asisten
      </Text>
      <PersonaPicker
        value={preferences.persona}
        onChange={(persona) => void updater.update({ persona })}
        disabled={updater.isPending}
      />
      <TextField
        label="Sapaan"
        value={address}
        onChangeText={setAddress}
        maxLength={40}
      />
      {address.trim() !== (preferences.preferredAddress ?? "") ? (
        <Button
          variant="secondary"
          label="Simpan sapaan"
          loading={updater.isPending}
          onPress={() =>
            void updater.update(
              { preferredAddress: address.trim() || null },
              { successMessage: "Sapaan disimpan" }
            )
          }
        />
      ) : null}
      <ListSection>
        <ListRow
          title="Kesibukan"
          value={
            preferences.occupation
              ? OCCUPATION_LABELS[preferences.occupation]
              : "Pilih"
          }
          disabled={updater.isPending}
          onPress={() =>
            showActions({
              title: "Kesibukan",
              options: [
                ...USER_OCCUPATIONS.map((occupation) => ({
                  label: OCCUPATION_LABELS[occupation],
                  onPress: () => void updater.update({ occupation }),
                })),
                {
                  label: "Kosongkan",
                  onPress: () => void updater.update({ occupation: null }),
                },
              ],
            })
          }
        />
        <SwitchRow
          title="Memori otomatis"
          subtitle="Simpan informasi yang berguna dari percakapan."
          value={preferences.automaticMemoryEnabled}
          disabled={updater.isPending}
          onValueChange={(automaticMemoryEnabled) =>
            void updater.update({ automaticMemoryEnabled })
          }
        />
      </ListSection>
    </SettingsScroll>
  );
}
