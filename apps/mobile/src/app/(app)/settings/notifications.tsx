import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/components/settings/app-flags";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { usePreferenceUpdater } from "@/components/settings/use-preference-updater";
import { useActionSheet } from "@/components/ui/action-sheet";
import { DateTimeField } from "@/components/ui/date-time-field";
import { ListRow, ListSection, SwitchRow } from "@/components/ui/list";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useProfile } from "@/lib/profile";
import { telegramStatusQueryOptions } from "@/lib/services/api/telegram/telegram.queries";
import type { UserPreferences } from "@/lib/services/api/users/users.api";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/users.queries";
import { whatsappStatusQueryOptions } from "@/lib/services/api/whatsapp/whatsapp.queries";

const followUp = [30, 60, 120, 180] as const;
const weekdays = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];

export default function NotificationSettingsScreen() {
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
  return <NotificationPreferences preferences={query.data} />;
}

function NotificationPreferences({
  preferences,
}: {
  preferences: UserPreferences;
}) {
  const router = useRouter();
  const profile = useProfile();
  const showActions = useActionSheet();
  const { update, isPending } = usePreferenceUpdater();
  const telegram = useQuery(telegramStatusQueryOptions());
  const whatsapp = useQuery({
    ...whatsappStatusQueryOptions(),
    enabled: WHATSAPP_INTEGRATION_ENABLED,
  });

  return (
    <SettingsScroll>
      <ListSection title="Saluran pengingat">
        <SwitchRow
          title="Notifikasi web"
          subtitle="Tampilkan notifikasi saat Sydia terbuka di web."
          value={preferences.webNotificationsEnabled}
          disabled={isPending}
          onValueChange={(webNotificationsEnabled) =>
            void update({ webNotificationsEnabled })
          }
        />
        {telegram.data?.linked ? (
          <SwitchRow
            title="Telegram"
            value={preferences.telegramNotificationsEnabled}
            disabled={isPending}
            onValueChange={(telegramNotificationsEnabled) =>
              void update({ telegramNotificationsEnabled })
            }
          />
        ) : (
          <ListRow
            title="Telegram"
            subtitle={telegram.error?.message}
            onPress={() => router.push("/settings/telegram")}
          />
        )}
        {WHATSAPP_INTEGRATION_ENABLED ? (
          whatsapp.data?.connected ? (
            <SwitchRow
              title="WhatsApp"
              value={preferences.whatsappNotificationsEnabled}
              disabled={isPending}
              onValueChange={(whatsappNotificationsEnabled) =>
                void update({ whatsappNotificationsEnabled })
              }
            />
          ) : (
            <ListRow
              title="WhatsApp"
              subtitle={whatsapp.error?.message}
              onPress={() => router.push("/settings/whatsapp")}
            />
          )
        ) : null}
      </ListSection>
      <ListSection title="Pengingat lanjutan">
        <ListRow
          title="Jeda pengingat"
          value={`${preferences.followUpIntervalMinutes} menit`}
          disabled={isPending}
          onPress={() =>
            showActions({
              title: "Jeda pengingat",
              options: followUp.map((followUpIntervalMinutes) => ({
                label: `${followUpIntervalMinutes} menit`,
                onPress: () => void update({ followUpIntervalMinutes }),
              })),
            })
          }
        />
      </ListSection>
      <ListSection title="Ringkasan">
        <SwitchRow
          title="Ringkasan harian"
          value={preferences.briefingEnabled}
          disabled={isPending}
          onValueChange={(briefingEnabled) => void update({ briefingEnabled })}
        />
        <SwitchRow
          title="Ringkasan mingguan"
          value={preferences.weeklyBriefingEnabled}
          disabled={isPending}
          onValueChange={(weeklyBriefingEnabled) =>
            void update({ weeklyBriefingEnabled })
          }
        />
        {preferences.weeklyBriefingEnabled ? (
          <ListRow
            title="Hari ringkasan"
            value={weekdays[preferences.weeklyBriefingDay - 1]}
            disabled={isPending}
            onPress={() =>
              showActions({
                title: "Hari ringkasan",
                options: weekdays.map((label, index) => ({
                  label,
                  onPress: () => void update({ weeklyBriefingDay: index + 1 }),
                })),
              })
            }
          />
        ) : null}
        {preferences.briefingEnabled || preferences.weeklyBriefingEnabled ? (
          <DateTimeField
            label="Jam ringkasan"
            value={new Date(`2000-01-01T${preferences.briefingTime}:00Z`)}
            onChange={(date) =>
              void update({ briefingTime: date.toISOString().slice(11, 16) })
            }
            mode="time"
            timeZone="UTC"
            locale={profile.locale}
            disabled={isPending}
          />
        ) : null}
      </ListSection>
    </SettingsScroll>
  );
}
