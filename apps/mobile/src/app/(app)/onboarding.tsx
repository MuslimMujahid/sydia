import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { OccupationOptions } from "@/components/onboarding/occupation-options";
import { PersonaPicker } from "@/components/onboarding/persona-picker";
import { TelegramConnectionPanel } from "@/components/settings/telegram-connection";
import { TimezonePicker } from "@/components/settings/timezone-picker";
import {
  timeZoneTitle,
  usableDeviceTimeZone,
} from "@/components/settings/timezones";
import { Button } from "@/components/ui/button";
import { ChatSparkGlyph } from "@/components/ui/glyphs";
import { ListRow, ListSection } from "@/components/ui/list";
import { ErrorState, InlineError, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useProfile } from "@/lib/profile";
import type {
  SupportedLocale,
  UserPreferences,
} from "@/lib/services/api/users/users.api";
import {
  useUpdateCurrentUser,
  useUpdateUserPreferences,
  userPreferencesQueryOptions,
} from "@/lib/services/api/users/users.queries";
import { colors, spacing } from "@/lib/theme";

const steps = [
  "Waktu dan bahasa",
  "Kenalan dengan Sydia",
  "Pilih gaya asisten",
  "Hubungkan Telegram",
];

export default function OnboardingScreen() {
  const query = useQuery(userPreferencesQueryOptions());
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        title="Pengaturan awal tidak dapat dimuat"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return <OnboardingForm preferences={query.data} />;
}

function OnboardingForm({ preferences }: { preferences: UserPreferences }) {
  const profile = useProfile();
  const profileMutation = useUpdateCurrentUser();
  const preferencesMutation = useUpdateUserPreferences();
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState(() =>
    profile.timezone === "Asia/Jakarta"
      ? (usableDeviceTimeZone() ?? profile.timezone)
      : profile.timezone
  );
  const [locale, setLocale] = useState(profile.locale);
  const [preferredAddress, setPreferredAddress] = useState(
    preferences.preferredAddress ?? ""
  );
  const [occupation, setOccupation] = useState(preferences.occupation);
  const [persona, setPersona] = useState(preferences.persona);
  const [zonePicker, setZonePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const error =
    preferencesMutation.error?.message ?? profileMutation.error?.message;

  async function advance() {
    if (step < 2) {
      setStep(step + 1);
      return;
    }

    setSaving(true);
    try {
      if (step === 2) {
        await preferencesMutation.mutateAsync({
          preferredAddress: preferredAddress.trim() || null,
          occupation,
          persona,
        });
      }
      await profileMutation.mutateAsync({
        name: profile.name,
        timezone,
        locale,
        onboardingCompleted: step === 3,
      });
      if (step === 2) setStep(3);
    } catch (error) {
      console.warn("Onboarding preferences could not be saved", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.brand}>
          <ChatSparkGlyph size={32} hue="coral" active />
          <Text variant="headline">Sydia</Text>
          <Text variant="footnote" tone="muted" style={styles.progress}>
            {step + 1} dari {steps.length}
          </Text>
        </View>
        <Text variant="title" accessibilityRole="header">
          {steps[step]}
        </Text>
        {step === 0 ? (
          <>
            <ListSection>
              <ListRow
                title="Zona waktu"
                subtitle={timeZoneTitle(timezone)}
                onPress={() => setZonePicker(true)}
              />
            </ListSection>
            <LanguageChoices locale={locale} onChange={setLocale} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <TextField
              label="Sydia sebaiknya memanggil Anda apa?"
              value={preferredAddress}
              onChangeText={setPreferredAddress}
              maxLength={40}
            />
            <Text variant="callout" weight="semibold">
              Apa kesibukan Anda?
            </Text>
            <OccupationOptions
              label="Kesibukan"
              value={occupation}
              onChange={setOccupation}
            />
          </>
        ) : null}
        {step === 2 ? (
          <PersonaPicker
            value={persona}
            onChange={setPersona}
            showRecommended
            disabled={saving}
          />
        ) : null}
        {step === 3 ? (
          <>
            <Text tone="muted">
              Hubungkan Telegram untuk menerima pengingat dan mengobrol dengan
              Sydia dari sana.
            </Text>
            <TelegramConnectionPanel onboarding />
          </>
        ) : null}
        <InlineError message={error} />
        <Button
          label={step === 3 ? "Mulai pakai Sydia" : "Lanjutkan"}
          loading={saving}
          fullWidth
          onPress={() => void advance()}
        />
        {step > 0 ? (
          <Button
            label="Kembali"
            variant="ghost"
            disabled={saving}
            onPress={() => setStep(step - 1)}
          />
        ) : null}
      </ScrollView>
      <TimezonePicker
        visible={zonePicker}
        value={timezone}
        onSelect={setTimezone}
        onClose={() => setZonePicker(false)}
      />
    </SafeAreaView>
  );
}

function LanguageChoices({
  locale,
  onChange,
}: {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  return (
    <ListSection title="Bahasa">
      <ListRow
        title="Bahasa Indonesia"
        value={locale === "id" ? "Aktif" : undefined}
        chevron={false}
        onPress={() => onChange("id")}
      />
      <ListRow
        title="English"
        value={locale === "en" ? "Aktif" : undefined}
        chevron={false}
        onPress={() => onChange("en")}
      />
    </ListSection>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  progress: { marginLeft: "auto" },
});
