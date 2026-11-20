import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { CircleCheck, ExternalLink, Unplug } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import type { TelegramLink } from "@/lib/services/api/telegram/telegram.api";
import {
  telegramStatusQueryOptions,
  useCreateTelegramLink,
  useUnlinkTelegram,
} from "@/lib/services/api/telegram/telegram.queries";
import { colors, radius, spacing } from "@/lib/theme";
import { TelegramMark } from "./brand-marks";
import { formatCountdown, telegramAccountLabel } from "./integration-status";

async function openTelegram(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);

    return true;
  } catch (error) {
    console.warn("Telegram link could not be opened", error);

    return false;
  }
}

/**
 * Link flow shared by Settings and onboarding: create a one-time bot link,
 * open Telegram, then poll until the bot confirms the account.
 */
export function useTelegramConnection() {
  const toast = useToast();
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const linkMutation = useCreateTelegramLink();
  const unlinkMutation = useUnlinkTelegram();
  const awaiting = Boolean(link && Date.parse(link.expiresAt) > now);

  const statusQuery = useQuery({
    ...telegramStatusQueryOptions(),
    refetchInterval: (query) =>
      awaiting && !query.state.data?.linked ? 3_000 : false,
  });

  const status = statusQuery.data;
  const linked = status?.linked === true;

  useEffect(() => {
    if (!awaiting || linked) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);

    return () => clearInterval(timer);
  }, [awaiting, linked]);

  const announcedLink = useRef<string | null>(null);

  // Celebrate once when the bot confirms the link this screen started.
  useEffect(() => {
    if (!linked || !link || announcedLink.current === link.url) return;
    announcedLink.current = link.url;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast("Telegram terhubung");
  }, [link, linked, toast]);

  async function connect() {
    try {
      const created = await linkMutation.mutateAsync();
      setNow(Date.now());
      setLink(created);
      if (!(await openTelegram(created.url)))
        toast(
          "Telegram tidak dapat dibuka. Ketuk “Buka Telegram” untuk mencoba lagi.",
          {
            tone: "error",
          }
        );
    } catch (error) {
      // The mutation error is shown under the button.
      console.warn("Telegram link could not be created", error);
    }
  }

  function reopen() {
    if (link) void openTelegram(link.url);
  }

  function confirmUnlink() {
    Alert.alert(
      "Putuskan Telegram?",
      "Sydia berhenti mengobrol dan mengirim pengingat lewat Telegram. Data Anda di Sydia tetap tersimpan.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Putuskan",
          style: "destructive",
          onPress: () =>
            unlinkMutation.mutate(undefined, {
              onSuccess: () => {
                setLink(null);
                toast("Telegram diputuskan");
              },
              onError: (error) => toast(error.message, { tone: "error" }),
            }),
        },
      ]
    );
  }

  return {
    status,
    statusQuery,
    linked,
    link,
    awaiting,
    expired: Boolean(link && !awaiting && !linked),
    secondsLeftLabel: link
      ? formatCountdown(Date.parse(link.expiresAt) - now)
      : "",
    connect,
    reopen,
    confirmUnlink,
    linkMutation,
    unlinkMutation,
  };
}

interface TelegramConnectionPanelProps {
  /** Onboarding drops the disconnect action and uses first-run wording. */
  onboarding?: boolean;
}

export function TelegramConnectionPanel({
  onboarding = false,
}: TelegramConnectionPanelProps) {
  const telegram = useTelegramConnection();
  const { status, statusQuery, linked } = telegram;
  const account = telegramAccountLabel(status);

  if (statusQuery.isPending)
    return (
      <View
        style={styles.center}
        accessibilityLabel="Memeriksa koneksi Telegram"
      >
        <ActivityIndicator color={colors.mutedForeground} />
        <Text variant="footnote" tone="muted">
          Memeriksa koneksi…
        </Text>
      </View>
    );

  if (statusQuery.isError)
    return (
      <View style={styles.stack}>
        <InlineError message={statusQuery.error.message} />
        <Button
          label="Coba lagi"
          variant="outline"
          size="sm"
          onPress={() => void statusQuery.refetch()}
        />
      </View>
    );

  if (linked)
    return (
      <View style={styles.stack}>
        <View style={styles.success} accessibilityRole="text">
          <CircleCheck size={18} color={colors.success} strokeWidth={2} />
          <Text variant="callout" color={colors.success} style={styles.flex}>
            Sydia siap mengobrol dan mengirim pengingat lewat Telegram.
          </Text>
        </View>
        <View style={styles.account}>
          <TelegramMark size={32} />
          <View style={styles.flex}>
            <Text variant="footnote" tone="muted">
              Akun Telegram
            </Text>
            <Text variant="body" weight="semibold">
              {account ?? "Terhubung"}
            </Text>
          </View>
        </View>
        {!onboarding ? (
          <Button
            label={
              telegram.unlinkMutation.isPending
                ? "Memutuskan…"
                : "Putuskan Telegram"
            }
            icon={Unplug}
            variant="destructive"
            loading={telegram.unlinkMutation.isPending}
            onPress={telegram.confirmUnlink}
          />
        ) : null}
      </View>
    );

  if (status && !status.available)
    return (
      <Text variant="callout" tone="muted">
        Integrasi Telegram belum tersedia di server ini.
        {status.notice ? ` ${status.notice}` : ""}
      </Text>
    );

  return (
    <View style={styles.stack}>
      <Text variant="callout" tone="muted">
        Ketuk tombol di bawah. Telegram akan membuka bot Sydia, lalu ketuk Start
        untuk menautkan akun Anda.
      </Text>
      {telegram.awaiting ? (
        <>
          <Button
            label="Buka Telegram"
            icon={ExternalLink}
            variant="secondary"
            fullWidth
            onPress={telegram.reopen}
          />
          <View style={styles.waiting} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.accent} />
            <Text variant="footnote" tone="muted" style={styles.flex}>
              Menunggu konfirmasi dari Telegram · tautan berlaku{" "}
              {telegram.secondsLeftLabel}
            </Text>
          </View>
        </>
      ) : (
        <Button
          label={
            telegram.linkMutation.isPending
              ? "Menyiapkan tautan…"
              : "Hubungkan Telegram"
          }
          icon={ExternalLink}
          variant={onboarding ? "secondary" : "primary"}
          fullWidth
          loading={telegram.linkMutation.isPending}
          onPress={() => void telegram.connect()}
        />
      )}
      {telegram.expired ? (
        <Text variant="footnote" tone="muted">
          Tautan kedaluwarsa. Ketuk Hubungkan Telegram untuk membuat tautan
          baru.
        </Text>
      ) : null}
      <InlineError message={telegram.linkMutation.error?.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stack: { gap: spacing.lg },
  flex: { flex: 1 },
  success: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
  },
  account: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  waiting: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
