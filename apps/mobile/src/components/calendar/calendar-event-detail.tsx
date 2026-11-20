import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import {
  Bell,
  CalendarDays,
  Cloud,
  Copy,
  Ellipsis,
  MapPin,
  Pencil,
  RefreshCw,
  Repeat,
  Trash2,
  Users,
  Video,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import {
  useActionSheet,
  type ActionSheetOption,
} from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { FormCard, FormDivider, FormScroll } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import type { CalendarEvent } from "@/lib/services/api/calendar/calendar.api";
import {
  calendarStatusQueryOptions,
  useCopyCalendarEvent,
  useDeleteCalendarEvent,
  useExportCalendarEvent,
  useResolveCalendarOccurrence,
  useRetryCalendarEventSync,
} from "@/lib/services/api/calendar/calendar.queries";
import { spacing } from "@/lib/theme";
import { formatZoneName } from "./calendar-date";
import { seedEventDetail } from "./event-detail-query";
import { reminderLabel } from "./event-draft";
import { notesToPlainText } from "./event-notes";
import { isRecurringOccurrence } from "./event-occurrence";
import { describeRecurrence } from "./event-recurrence";
import { calendarSyncLabel } from "./kind-style";
import { eventScheduleItem, itemWhenLabel } from "./schedule-items";
import { useCalendarWriteKey } from "./use-calendar-write-key";

export function CalendarEventDetail({
  event,
  routeId,
  onDeleted,
}: {
  event: CalendarEvent;
  routeId: string;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const profile = useProfile();
  const toast = useToast();
  const showActions = useActionSheet();
  const keys = useCalendarWriteKey();
  const status = useQuery(calendarStatusQueryOptions());
  const resolve = useResolveCalendarOccurrence();
  const cancel = useDeleteCalendarEvent();
  const copy = useCopyCalendarEvent();
  const exportToGoogle = useExportCalendarEvent();
  const retry = useRetryCalendarEventSync();
  const [actionError, setActionError] = useState<string>();
  const busy =
    cancel.isPending ||
    resolve.isPending ||
    copy.isPending ||
    exportToGoogle.isPending ||
    retry.isPending;
  const timezone = event.timezone ?? profile.timezone;
  const occurrence = isRecurringOccurrence(event);
  const item = eventScheduleItem(event);
  const notes = notesToPlainText(event.description);
  const cancelled = event.status === "cancelled";

  function forOccurrence(onResolved: (id: string) => void) {
    if (!occurrence) return onResolved(event.id);
    if (!event.seriesEventId || !event.occurrenceKey) {
      console.warn("Recurring event has no occurrence identity");
      setActionError(
        "Kejadian ini tidak dapat diubah. Muat ulang kalender lalu coba lagi."
      );
      return;
    }
    resolve.mutate(
      {
        seriesEventId: event.seriesEventId,
        occurrenceKey: event.occurrenceKey,
        instanceEventId: event.instanceEventId,
      },
      { onSuccess: (record) => onResolved(record.id) }
    );
  }

  function openEdit(id: string) {
    router.push({
      pathname: "/event/edit/[id]",
      params: { id, from: routeId },
    });
  }

  function edit() {
    setActionError(undefined);
    if (!occurrence) return openEdit(event.id);
    showActions({
      title: "Ubah acara berulang",
      options: [
        { label: "Hanya kejadian ini", onPress: () => openEdit(routeId) },
        ...(event.seriesEventId
          ? [
              {
                label: "Seluruh rangkaian",
                onPress: () => {
                  if (event.seriesEventId) openEdit(event.seriesEventId);
                },
              },
            ]
          : []),
      ],
    });
  }

  function cancelEvent(id: string) {
    const idempotencyKey = keys.keyFor("cancel", id);
    cancel.mutate(
      { eventId: id, idempotencyKey },
      {
        onSuccess: () => {
          keys.clear(idempotencyKey);
          toast("Acara dibatalkan");
          onDeleted();
        },
      }
    );
  }

  function confirmCancel(scope: "event" | "occurrence" | "series") {
    Alert.alert(
      scope === "series"
        ? "Batalkan seluruh rangkaian?"
        : "Batalkan acara ini?",
      `“${event.title}” akan dibatalkan.`,
      [
        { text: "Kembali", style: "cancel" },
        {
          text: "Batalkan acara",
          style: "destructive",
          onPress: () => {
            if (scope === "series" && event.seriesEventId)
              cancelEvent(event.seriesEventId);
            else forOccurrence(cancelEvent);
          },
        },
      ]
    );
  }

  function chooseCancel() {
    setActionError(undefined);
    if (!occurrence) return confirmCancel("event");
    showActions({
      title: "Batalkan acara berulang",
      options: [
        {
          label: "Hanya kejadian ini",
          onPress: () => confirmCancel("occurrence"),
          destructive: true,
        },
        ...(event.seriesEventId
          ? [
              {
                label: "Seluruh rangkaian",
                onPress: () => confirmCancel("series"),
                destructive: true,
              },
            ]
          : []),
      ],
    });
  }

  function copyEvent() {
    setActionError(undefined);
    forOccurrence((id) => {
      const idempotencyKey = keys.keyFor("copy", id);
      copy.mutate(
        { eventId: id, idempotencyKey },
        {
          onSuccess: (record) => {
            keys.clear(idempotencyKey);
            seedEventDetail(client, record);
            toast("Salinan disimpan di Sydia");
            router.push({ pathname: "/event/[id]", params: { id: record.id } });
          },
        }
      );
    });
  }

  function exportEvent() {
    setActionError(undefined);
    forOccurrence((id) => {
      const idempotencyKey = keys.keyFor("export", id);
      exportToGoogle.mutate(
        { eventId: id, idempotencyKey },
        {
          onSuccess: (record) => {
            keys.clear(idempotencyKey);
            seedEventDetail(client, record);
            toast("Acara dikirim ke Google Calendar");
          },
        }
      );
    });
  }

  function retrySync() {
    setActionError(undefined);
    forOccurrence((id) => {
      retry.mutate(id, {
        onSuccess: (record) => seedEventDetail(client, record),
      });
    });
  }

  function openMenu() {
    const options: ActionSheetOption[] = [];
    if (event.provider === "google" && !cancelled)
      options.push({ label: "Salin ke Sydia", icon: Copy, onPress: copyEvent });
    if (status.data?.connected && event.provider === "local" && !cancelled)
      options.push({
        label: "Ekspor ke Google Calendar",
        icon: Cloud,
        onPress: exportEvent,
      });
    if (!cancelled)
      options.push({
        label: "Batalkan acara",
        icon: Trash2,
        onPress: chooseCancel,
        destructive: true,
      });
    showActions({ title: event.title, options });
  }

  async function joinMeet(url: string) {
    try {
      const target = new URL(url);
      if (target.protocol !== "https:" || target.hostname !== "meet.google.com")
        throw new Error("Unexpected Google Meet URL");
      await Linking.openURL(target.toString());
    } catch (error) {
      console.warn(
        "Could not open event meeting",
        error instanceof Error ? error.name : "Unknown error"
      );
      setActionError("Tautan Google Meet tidak dapat dibuka.");
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {!cancelled ? (
                <IconButton
                  icon={Pencil}
                  accessibilityLabel="Ubah acara"
                  disabled={busy}
                  onPress={edit}
                />
              ) : null}
              {!cancelled ? (
                <IconButton
                  icon={Ellipsis}
                  accessibilityLabel="Tindakan acara"
                  disabled={busy}
                  onPress={openMenu}
                />
              ) : null}
            </View>
          ),
        }}
      />
      <FormScroll>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title" weight="bold" accessibilityRole="header">
            {event.title}
          </Text>
          {cancelled ? (
            <Text variant="callout" tone="destructive">
              Dibatalkan
            </Text>
          ) : null}
        </View>
        <FormCard>
          {item ? (
            <ListRow
              title={itemWhenLabel(item, timezone)}
              titleLines={3}
              subtitle={
                event.allDayStartDate ? undefined : formatZoneName(timezone)
              }
              icon={CalendarDays}
            />
          ) : null}
          {event.location ? (
            <ListRow title={event.location} titleLines={2} icon={MapPin} />
          ) : null}
          {event.recurrence.length ? (
            <ListRow
              title={describeRecurrence(event.recurrence, timezone)}
              titleLines={2}
              icon={Repeat}
            />
          ) : null}
          {typeof event.reminderMinutes === "number" ? (
            <ListRow title={reminderLabel(event.reminderMinutes)} icon={Bell} />
          ) : null}
        </FormCard>
        {event.googleMeetUrl ||
        event.googleMeetStatus === "pending" ||
        event.googleMeetStatus === "failure" ? (
          <FormCard>
            <ListRow
              title={
                event.googleMeetUrl
                  ? "Gabung Google Meet"
                  : event.googleMeetStatus === "pending"
                    ? "Membuat tautan Google Meet…"
                    : "Tautan Google Meet gagal dibuat"
              }
              titleLines={2}
              icon={Video}
              onPress={
                event.googleMeetUrl
                  ? () => {
                      if (event.googleMeetUrl)
                        void joinMeet(event.googleMeetUrl);
                    }
                  : undefined
              }
            />
          </FormCard>
        ) : null}
        {event.attendees.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="semibold"
              tone="muted"
              accessibilityRole="header"
            >
              Peserta
            </Text>
            <FormCard>
              {event.attendees.map((email) => (
                <ListRow key={email} title={email} icon={Users} />
              ))}
            </FormCard>
          </View>
        ) : null}
        {notes ? (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="semibold"
              tone="muted"
              accessibilityRole="header"
            >
              Catatan
            </Text>
            <Text selectable>{notes}</Text>
          </View>
        ) : null}
        <FormCard>
          <ListRow
            title={calendarSyncLabel(event.syncState)}
            titleLines={2}
            icon={Cloud}
            onPress={
              ["conflict", "reconnect_required"].includes(event.syncState)
                ? () => router.push("/settings/integrations")
                : undefined
            }
          />
          {event.syncState === "error" ? (
            <>
              <FormDivider />
              <ListRow
                title="Coba sinkronkan kembali"
                icon={RefreshCw}
                onPress={retrySync}
                disabled={busy}
              />
            </>
          ) : null}
        </FormCard>
        <InlineError
          message={
            actionError ??
            resolve.error?.message ??
            cancel.error?.message ??
            copy.error?.message ??
            exportToGoogle.error?.message ??
            retry.error?.message
          }
        />
      </FormScroll>
    </>
  );
}
