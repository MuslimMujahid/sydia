import { useQuery } from "@tanstack/react-query";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Bell, BellOff, Plus, Repeat } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import {
  FREQUENCY_CHOICE_LABELS,
  groupRemindersByDay,
  OCCURRENCE_STATUS_LABELS,
  SCHEDULE_FILTERS,
  SCHEDULE_LABELS,
  snoozedFromLabel,
} from "@/components/reminders/reminder-view";
import { useDebouncedValue } from "@/components/tasks/use-debounced-value";
import { useNow } from "@/components/tasks/use-now";
import { IconButton } from "@/components/ui/button";
import { Chip, ChipRow, Divider } from "@/components/ui/controls";
import { FormCard } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useProfile } from "@/lib/profile";
import type {
  Reminder,
  ReminderScheduleFilter,
} from "@/lib/services/api/reminders/reminders.api";
import {
  reminderDeliveryQueryOptions,
  remindersQueryOptions,
} from "@/lib/services/api/reminders/reminders.queries";
import { colors, spacing } from "@/lib/theme";
import { formatTimeInZone } from "@/lib/utils/date-time";

export default function RemindersScreen() {
  const router = useRouter();
  const { timezone, locale } = useProfile();
  const now = useNow();
  const [schedule, setSchedule] = useState<ReminderScheduleFilter | "all">(
    "all"
  );
  const [draft, setDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const search = useDebouncedValue(draft.trim());
  const reminders = useQuery(remindersQueryOptions({ schedule, search }));
  const delivery = useQuery(reminderDeliveryQueryOptions());
  const refetchDelivery = delivery.refetch;
  const sections = useMemo(
    () => groupRemindersByDay(reminders.data ?? [], timezone, now),
    [reminders.data, timezone, now]
  );

  useFocusEffect(
    useCallback(() => {
      void refetchDelivery();
    }, [refetchDelivery])
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([reminders.refetch(), delivery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  function renderReminder({ item }: { item: Reminder }) {
    const status = item.latestOccurrence
      ? OCCURRENCE_STATUS_LABELS[item.latestOccurrence.status]
      : undefined;
    const subtitle = [
      item.recurrence
        ? FREQUENCY_CHOICE_LABELS[item.recurrence.frequency]
        : undefined,
      item.important ? "Penting" : undefined,
      status,
      snoozedFromLabel(item, timezone),
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <ListRow
        title={item.title}
        titleLines={2}
        subtitle={subtitle}
        value={formatTimeInZone(item.scheduledAt, timezone, locale)}
        icon={item.recurrence ? Repeat : Bell}
        onPress={() =>
          router.push({ pathname: "/reminder/[id]", params: { id: item.id } })
        }
      />
    );
  }

  const deliveryStatus = delivery.data?.status;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon={Plus}
              accessibilityLabel="Pengingat baru"
              onPress={() => router.push("/reminder/new")}
            />
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderReminder}
        renderSectionHeader={({ section }) => (
          <Text
            style={styles.heading}
            variant="footnote"
            weight="semibold"
            tone="muted"
            accessibilityRole="header"
          >
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={Divider}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        ListHeaderComponent={
          <View style={styles.filters}>
            <TextField
              accessibilityLabel="Cari pengingat"
              placeholder="Cari pengingat"
              value={draft}
              onChangeText={setDraft}
              returnKeyType="search"
            />
            <ChipRow>
              {SCHEDULE_FILTERS.map((value) => (
                <Chip
                  key={value}
                  label={SCHEDULE_LABELS[value]}
                  selected={schedule === value}
                  onPress={() => setSchedule(value)}
                />
              ))}
            </ChipRow>
            {deliveryStatus === "no_channel" ||
            deliveryStatus === "notifications_off" ? (
              <FormCard>
                <ListRow
                  title={
                    deliveryStatus === "no_channel"
                      ? "Hubungkan saluran pengingat"
                      : "Aktifkan notifikasi pengingat"
                  }
                  subtitle={
                    deliveryStatus === "no_channel"
                      ? "Kirim pengingat melalui Telegram atau WhatsApp."
                      : "Notifikasi di semua saluran sedang dimatikan."
                  }
                  icon={BellOff}
                  onPress={() =>
                    router.push(
                      deliveryStatus === "no_channel"
                        ? "/settings/integrations"
                        : "/settings/notifications"
                    )
                  }
                />
              </FormCard>
            ) : null}
            <InlineError message={delivery.error?.message} />
            {reminders.data ? (
              <InlineError message={reminders.error?.message} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          reminders.isPending ? (
            <ListSkeleton rows={4} />
          ) : reminders.isError ? (
            <ErrorState
              title="Pengingat tidak dapat dimuat"
              message={reminders.error.message}
              onRetry={() => void reminders.refetch()}
            />
          ) : (
            <EmptyState
              title={
                search || schedule !== "all"
                  ? "Tidak ada hasil"
                  : "Belum ada pengingat"
              }
              icon={<Bell color={colors.mutedForeground} size={28} />}
              message={
                search || schedule !== "all"
                  ? "Coba kata kunci atau waktu yang berbeda."
                  : "Ketuk + untuk membuat pengingat."
              }
            />
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.huge },
  filters: { gap: spacing.md, padding: spacing.lg },
  heading: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
});
