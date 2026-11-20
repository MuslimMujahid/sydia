import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { setAppLocale } from "@/lib/i18n";
import {
  formModalOptions,
  sheetOptions,
  stackScreenOptions,
  areaScreenOptions,
} from "@/lib/navigation";
import { ProfileProvider } from "@/lib/profile";
import { currentUserQueryOptions } from "@/lib/services/api/users/users.queries";
import { colors } from "@/lib/theme";

/**
 * Signed-in shell: loads the profile every screen needs (time zone, locale),
 * then hosts one stack: the home conversation at its root, the feature menu
 * sheet, and every area, detail screen, and form pushed above it.
 */
export default function AppLayout() {
  const profileQuery = useQuery(currentUserQueryOptions());
  const profile = profileQuery.data;

  useEffect(() => {
    if (profile) setAppLocale(profile.locale);
  }, [profile]);

  if (profileQuery.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoadingState label="Menyiapkan Sydia…" />
      </View>
    );

  if (profileQuery.isError || !profile)
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ErrorState
          title="Profil tidak dapat dimuat"
          message={
            profileQuery.error?.message ??
            "Periksa koneksi Anda, lalu coba lagi."
          }
          onRetry={() => void profileQuery.refetch()}
        />
      </View>
    );

  const onboarded = profile.onboardingCompleted;

  return (
    <ProfileProvider profile={profile}>
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="index" options={{ title: "" }} />
          <Stack.Screen
            name="menu"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.75, 1] }}
          />

          {/* Feature areas, opened from the menu */}
          <Stack.Screen
            name="calendar"
            options={{ ...areaScreenOptions, title: "Kalender" }}
          />
          <Stack.Screen
            name="tasks"
            options={{ ...areaScreenOptions, title: "Tugas" }}
          />
          <Stack.Screen
            name="notes/index"
            options={{ ...areaScreenOptions, title: "Catatan" }}
          />
          <Stack.Screen name="notes/folder/[id]" options={{ title: "" }} />
          <Stack.Screen name="files/index" options={{ title: "File" }} />
          <Stack.Screen name="files/[folderId]" options={{ title: "" }} />
          <Stack.Screen
            name="reminders"
            options={{ ...areaScreenOptions, title: "Pengingat" }}
          />
          <Stack.Screen
            name="contacts"
            options={{ ...areaScreenOptions, title: "Kontak" }}
          />
          <Stack.Screen
            name="contact-groups"
            options={{ title: "Grup kontak" }}
          />
          <Stack.Screen
            name="secrets"
            options={{ ...areaScreenOptions, title: "Rahasia" }}
          />

          {/* Settings */}
          <Stack.Screen name="settings/profile" options={{ title: "Profil" }} />
          <Stack.Screen
            name="settings/assistant"
            options={{ title: "Asisten" }}
          />
          <Stack.Screen
            name="settings/notifications"
            options={{ title: "Notifikasi" }}
          />
          <Stack.Screen
            name="settings/integrations"
            options={{ title: "Integrasi" }}
          />
          <Stack.Screen
            name="settings/telegram"
            options={{ title: "Telegram" }}
          />
          <Stack.Screen
            name="settings/whatsapp"
            options={{ title: "WhatsApp" }}
          />
          <Stack.Screen
            name="settings/billing"
            options={{ title: "Langganan" }}
          />

          {/* Chat */}
          <Stack.Screen name="chat/[id]" options={{ title: "" }} />
          <Stack.Screen
            name="history"
            options={{ title: "Riwayat percakapan" }}
          />
          <Stack.Screen name="change-email" options={{ title: "Ubah email" }} />

          {/* Calendar */}
          <Stack.Screen name="event/[id]" options={{ title: "Acara" }} />
          <Stack.Screen
            name="event/new"
            options={{ ...formModalOptions, title: "Acara baru" }}
          />
          <Stack.Screen
            name="event/edit/[id]"
            options={{ ...formModalOptions, title: "Ubah acara" }}
          />

          {/* Tasks */}
          <Stack.Screen
            name="task/new"
            options={{ ...formModalOptions, title: "Tugas baru" }}
          />
          <Stack.Screen
            name="task/[id]"
            options={{ ...formModalOptions, title: "Tugas" }}
          />
          <Stack.Screen
            name="categories"
            options={{ ...formModalOptions, title: "Kategori" }}
          />

          {/* Reminders */}
          <Stack.Screen
            name="reminder/new"
            options={{ ...formModalOptions, title: "Pengingat baru" }}
          />
          <Stack.Screen
            name="reminder/[id]"
            options={{ ...formModalOptions, title: "Pengingat" }}
          />

          {/* Notes */}
          <Stack.Screen name="note/[ref]" options={{ title: "" }} />
          <Stack.Screen name="record/[id]" options={{ title: "" }} />
          <Stack.Screen
            name="daily-notes"
            options={{ title: "Catatan harian" }}
          />

          {/* Files */}
          <Stack.Screen name="document/[id]" options={{ title: "File" }} />
          <Stack.Screen
            name="move-items"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.7, 1] }}
          />

          {/* Contacts */}
          <Stack.Screen name="contact/[id]" options={{ title: "" }} />
          <Stack.Screen
            name="contact/new"
            options={{ ...formModalOptions, title: "Kontak baru" }}
          />
          <Stack.Screen
            name="contact/edit/[id]"
            options={{ ...formModalOptions, title: "Ubah kontak" }}
          />
        </Stack.Protected>

        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ProfileProvider>
  );
}
