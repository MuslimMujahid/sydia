import { useRouter } from "expo-router";
import { useState } from "react";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { TimezonePicker } from "@/components/settings/timezone-picker";
import { timeZoneTitle } from "@/components/settings/timezones";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { InlineError } from "@/components/ui/states";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import { useUpdateCurrentUser } from "@/lib/services/api/users/users.queries";

export default function ProfileSettingsScreen() {
  const profile = useProfile();
  const router = useRouter();
  const mutation = useUpdateCurrentUser();
  const showActions = useActionSheet();
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [locale, setLocale] = useState(profile.locale);
  const [zonePicker, setZonePicker] = useState(false);
  const dirty =
    name.trim() !== profile.name ||
    timezone !== profile.timezone ||
    locale !== profile.locale;

  function save() {
    mutation.mutate(
      {
        name: name.trim(),
        timezone,
        locale,
        onboardingCompleted: profile.onboardingCompleted,
      },
      {
        onSuccess: () => toast("Profil disimpan"),
        onError: (error) =>
          console.warn("Profile settings could not be saved", error),
      }
    );
  }

  return (
    <SettingsScroll>
      <TextField
        label="Nama"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        maxLength={100}
      />
      <ListSection>
        <ListRow
          title="Email"
          subtitle={profile.email}
          onPress={() => router.push("/change-email")}
        />
        <ListRow
          title="Zona waktu"
          subtitle={timeZoneTitle(timezone)}
          onPress={() => setZonePicker(true)}
        />
        <ListRow
          title="Bahasa"
          value={locale === "id" ? "Indonesia" : "English"}
          onPress={() =>
            showActions({
              title: "Bahasa",
              options: [
                { label: "Bahasa Indonesia", onPress: () => setLocale("id") },
                { label: "English", onPress: () => setLocale("en") },
              ],
            })
          }
        />
      </ListSection>
      <InlineError message={mutation.error?.message} />
      <Button
        label="Simpan"
        disabled={!dirty || name.trim().length < 2}
        loading={mutation.isPending}
        onPress={save}
      />
      <TimezonePicker
        visible={zonePicker}
        value={timezone}
        onSelect={setTimezone}
        onClose={() => setZonePicker(false)}
      />
    </SettingsScroll>
  );
}
