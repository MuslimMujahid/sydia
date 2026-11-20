import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import {
  WHATSAPP_INTEGRATION_ENABLED,
  WEB_APP_URL,
} from "@/components/settings/app-flags";
import {
  calendarConnection,
  calendarSummary,
  telegramSummary,
  whatsappSummary,
} from "@/components/settings/integration-status";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { useActionSheet } from "@/components/ui/action-sheet";
import { ListRow, ListSection } from "@/components/ui/list";
import { InlineError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  calendarStatusQueryOptions,
  googleCalendarsQueryOptions,
  useDisconnectCalendar,
  useSelectGoogleCalendar,
} from "@/lib/services/api/calendar/calendar.queries";
import { telegramStatusQueryOptions } from "@/lib/services/api/telegram/telegram.queries";
import { whatsappStatusQueryOptions } from "@/lib/services/api/whatsapp/whatsapp.queries";

export default function IntegrationsScreen() {
  const router = useRouter();
  const showActions = useActionSheet();
  const toast = useToast();
  const calendar = useQuery(calendarStatusQueryOptions());
  const telegram = useQuery(telegramStatusQueryOptions());
  const whatsapp = useQuery({
    ...whatsappStatusQueryOptions(),
    enabled: WHATSAPP_INTEGRATION_ENABLED,
  });
  const connection = calendarConnection(calendar.data);
  const choices = useQuery(
    googleCalendarsQueryOptions(connection === "connected")
  );
  const disconnect = useDisconnectCalendar();
  const select = useSelectGoogleCalendar();

  async function openWeb() {
    if (!WEB_APP_URL) return;
    try {
      await WebBrowser.openBrowserAsync(`${WEB_APP_URL}/settings/integrations`);
      await calendar.refetch();
    } catch (error) {
      console.warn("Google Calendar setup page could not be opened", error);
      toast("Pengaturan Google Calendar tidak dapat dibuka.", {
        tone: "error",
      });
    }
  }

  function confirmDisconnect() {
    Alert.alert(
      "Putuskan Google Calendar?",
      "Acara lokal tetap tersimpan di Sydia.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Putuskan",
          style: "destructive",
          onPress: () =>
            disconnect.mutate(undefined, {
              onError: (error) =>
                console.warn("Google Calendar disconnect failed", error),
            }),
        },
      ]
    );
  }

  return (
    <SettingsScroll
      refreshing={calendar.isRefetching}
      onRefresh={() => {
        void calendar.refetch();
        void telegram.refetch();
        if (WHATSAPP_INTEGRATION_ENABLED) void whatsapp.refetch();
      }}
    >
      <ListSection>
        <ListRow
          title="Telegram"
          subtitle={telegram.error?.message ?? telegramSummary(telegram.data)}
          onPress={() => router.push("/settings/telegram")}
        />
        {WHATSAPP_INTEGRATION_ENABLED ? (
          <ListRow
            title="WhatsApp"
            subtitle={whatsapp.error?.message ?? whatsappSummary(whatsapp.data)}
            onPress={() => router.push("/settings/whatsapp")}
          />
        ) : null}
      </ListSection>
      <ListSection
        title="Google Calendar"
        footer={
          !WEB_APP_URL && connection !== "connected"
            ? "Hubungkan Google Calendar melalui Pengaturan → Integrasi di Sydia web."
            : undefined
        }
      >
        <ListRow
          title={
            calendar.isPending
              ? "Memeriksa koneksi…"
              : calendarSummary(calendar.data)
          }
          subtitle={calendar.error?.message}
        />
        {connection === "connected" ? (
          <ListRow
            title="Kalender sinkronisasi"
            value={
              choices.data?.find(
                (item) => item.id === calendar.data?.calendarId
              )?.name
            }
            subtitle={choices.error?.message}
            disabled={choices.isPending || select.isPending}
            onPress={() => {
              if (choices.isError) {
                void choices.refetch();
                return;
              }
              if (!choices.data?.length) return;
              showActions({
                title: "Pilih kalender",
                options: choices.data
                  .filter((item) => item.writable)
                  .map((item) => ({
                    label: item.name,
                    onPress: () =>
                      select.mutate(
                        { calendarId: item.id },
                        {
                          onError: (error) =>
                            console.warn(
                              "Google Calendar selection failed",
                              error
                            ),
                        }
                      ),
                  })),
              });
            }}
          />
        ) : null}
        {WEB_APP_URL &&
        (connection === "disconnected" || connection === "reconnect") ? (
          <ListRow title="Hubungkan di web" onPress={() => void openWeb()} />
        ) : null}
        {connection === "connected" ||
        connection === "reconnect" ||
        connection === "disconnecting" ? (
          <ListRow
            title={
              connection === "disconnecting"
                ? "Coba putuskan lagi"
                : "Putuskan koneksi"
            }
            destructive
            disabled={disconnect.isPending}
            onPress={confirmDisconnect}
          />
        ) : null}
      </ListSection>
      <InlineError
        message={disconnect.error?.message ?? select.error?.message}
      />
    </SettingsScroll>
  );
}
