import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePreventRemove } from "expo-router";
import { CalendarDays, FileText, Video } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useActionSheet } from "@/components/ui/action-sheet";
import { DateTimeField } from "@/components/ui/date-time-field";
import {
  FormCard,
  FormDivider,
  FormHeader,
  FormScroll,
} from "@/components/ui/form";
import { ListRow, SwitchRow } from "@/components/ui/list";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useProfile } from "@/lib/profile";
import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "@/lib/services/api/calendar/calendar.api";
import {
  calendarStatusQueryOptions,
  useCreateCalendarEvent,
  useResolveCalendarOccurrence,
  useUpdateCalendarEvent,
} from "@/lib/services/api/calendar/calendar.queries";
import { spacing } from "@/lib/theme";
import {
  dayKeyInZone,
  formatZoneName,
  zonedMidnightMs,
  type DayKey,
} from "./calendar-date";
import { changedEventValues } from "./calendar-event-write";
import { seedEventDetail } from "./event-detail-query";
import {
  EVENT_REMINDER_OPTIONS,
  eventDraftToWrite,
  initialEventDraft,
  moveAllDayStart,
  moveStart,
  reminderLabel,
  toggleAllDay,
  validateEventDraft,
  type EventDraft,
} from "./event-draft";
import { EventNoteEditor } from "./event-note-editor";
import { editableEventNotes } from "./event-note-editor-content";
import { notesToPlainText } from "./event-notes";
import { isRecurringOccurrence } from "./event-occurrence";
import { EventRepeatField } from "./event-repeat-field";
import { eventTimeInZone, eventTimeResult } from "./event-time";
import { useCalendarWriteKey } from "./use-calendar-write-key";

interface CalendarEventEditorProps {
  event?: CalendarEvent;
  day?: DayKey;
  onCancel: () => void;
  onSaved: (event: CalendarEvent) => void;
}

export function CalendarEventEditor({
  event,
  day,
  onCancel,
  onSaved,
}: CalendarEventEditorProps) {
  const profile = useProfile();
  const timezone = event?.timezone ?? profile.timezone;
  const showActions = useActionSheet();
  const client = useQueryClient();
  const [initial] = useState(() => initialEventDraft({ event, day, timezone }));
  const [draft, setDraft] = useState(initial);
  const [destination, setDestination] = useState<"local" | "google">();
  const [createMeet, setCreateMeet] = useState(false);
  const [reminderChanged, setReminderChanged] = useState(false);
  const [editingRepeat, setEditingRepeat] = useState(false);
  const [editingNotes, setEditingNotes] = useState<{ html: string }>();
  const [writeError, setWriteError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const status = useQuery(calendarStatusQueryOptions());
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent();
  const resolve = useResolveCalendarOccurrence();
  const keys = useCalendarWriteKey();
  const editingOccurrence = Boolean(event && isRecurringOccurrence(event));
  const target = destination ?? (status.data?.connected ? "google" : "local");
  const google = event ? event.provider === "google" : target === "google";
  const mutation = event ? update : create;
  const busy = mutation.isPending || resolve.isPending;
  const dirty =
    JSON.stringify(initial) !== JSON.stringify(draft) ||
    createMeet ||
    reminderChanged;
  const allowRemoval = usePreventRemove(
    !editingNotes && !leaving && (dirty || busy),
    ({ repeat }) => {
      if (busy) return;
      Alert.alert("Buang perubahan?", "Perubahan acara belum disimpan.", [
        { text: "Lanjut mengedit", style: "cancel" },
        {
          text: "Buang",
          style: "destructive",
          onPress: () => {
            setLeaving(true);
            repeat();
          },
        },
      ]);
    }
  );
  const errors = validateEventDraft(draft);
  const start = useMemo(
    () => eventTimeResult(draft.startAt, timezone),
    [draft.startAt, timezone]
  );
  const end = useMemo(
    () => eventTimeResult(draft.endAt, timezone),
    [draft.endAt, timezone]
  );
  const timeError = draft.isAllDay
    ? undefined
    : !start.ok
      ? start.message
      : !end.ok
        ? end.message
        : undefined;
  const canSave =
    !busy &&
    !editingRepeat &&
    !timeError &&
    Object.keys(errors).length === 0 &&
    (!event || dirty);

  function change<K extends keyof EventDraft>(name: K, value: EventDraft[K]) {
    setWriteError(undefined);
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function save() {
    if (!canSave) return;
    let values: CalendarEventWriteInput;

    try {
      values = eventDraftToWrite(draft, {
        timezone,
        originalDescription: event?.description,
        createGoogleMeet: google && createMeet ? true : undefined,
        includeReminder: !event || reminderChanged,
      });
    } catch (error) {
      console.warn(
        "Calendar event time could not be converted",
        error instanceof Error ? error.name : "Unknown error"
      );
      setWriteError(
        error instanceof Error
          ? error.message
          : "Waktu acara tidak dapat disimpan."
      );
      return;
    }

    if (!event) {
      const idempotencyKey = keys.keyFor("create", { target, values });
      create.mutate(
        { destination: target, idempotencyKey, values },
        { onSuccess: (record) => completeWrite(record, idempotencyKey) }
      );
      return;
    }

    const timeChanged =
      draft.isAllDay !== initial.isAllDay ||
      (draft.isAllDay
        ? draft.allDayStartDate !== initial.allDayStartDate ||
          draft.allDayEndDate !== initial.allDayEndDate
        : draft.startAt !== initial.startAt || draft.endAt !== initial.endAt);
    const patch = changedEventValues(event, values, { timeChanged });
    if (!Object.keys(patch).length) {
      setLeaving(true);
      allowRemoval();
      onCancel();
      return;
    }

    if (editingOccurrence) {
      if (!event.seriesEventId || !event.occurrenceKey) {
        console.warn("Recurring event has no occurrence identity");
        setWriteError(
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
        { onSuccess: (stored) => updateEvent(stored.id, patch) }
      );
    } else updateEvent(event.id, patch);
  }

  function updateEvent(id: string, values: Partial<CalendarEventWriteInput>) {
    const idempotencyKey = keys.keyFor("update", { id, values });
    update.mutate(
      { eventId: id, values, idempotencyKey },
      {
        onSuccess: (record) => completeWrite(record, idempotencyKey),
      }
    );
  }

  function completeWrite(record: CalendarEvent, key: string) {
    keys.clear(key);
    seedEventDetail(client, record);
    setLeaving(true);
    allowRemoval();
    onSaved(record);
  }

  const startDay = draft.isAllDay
    ? draft.allDayStartDate
    : draft.startAt.slice(0, 10);
  const note = editableEventNotes(
    draft.notesTouched ? draft.notesHtml : event?.description
  );

  if (editingNotes)
    return (
      <EventNoteEditor
        html={editingNotes.html}
        onCancel={() => setEditingNotes(undefined)}
        onApply={(html) => {
          setDraft((current) => ({
            ...current,
            notes: notesToPlainText(html),
            notesHtml: html,
            notesTouched: true,
          }));
          setEditingNotes(undefined);
        }}
      />
    );

  return (
    <>
      <FormHeader
        title={event ? "Ubah acara" : "Acara baru"}
        onCancel={onCancel}
        onSave={save}
        canSave={canSave}
        saving={busy}
      />
      <FormScroll>
        <TextField
          label="Judul"
          placeholder="Nama acara"
          value={draft.title}
          onChangeText={(title) => change("title", title)}
          maxLength={300}
          editable={!busy}
        />
        <View style={styles.group}>
          <FormCard>
            <SwitchRow
              title="Sepanjang hari"
              value={draft.isAllDay}
              icon={CalendarDays}
              onValueChange={(allDay) =>
                setDraft((current) => toggleAllDay(current, allDay))
              }
              disabled={busy || editingRepeat}
            />
            <FormDivider />
            {draft.isAllDay ? (
              <>
                <DateTimeField
                  label="Mulai"
                  value={
                    new Date(zonedMidnightMs(draft.allDayStartDate, timezone))
                  }
                  onChange={(date) =>
                    setDraft((current) =>
                      moveAllDayStart(current, dayKeyInZone(date, timezone))
                    )
                  }
                  mode="date"
                  timeZone={timezone}
                  locale={profile.locale}
                  disabled={busy || editingRepeat}
                />
                <FormDivider />
                <DateTimeField
                  label="Selesai"
                  value={
                    new Date(zonedMidnightMs(draft.allDayEndDate, timezone))
                  }
                  onChange={(date) =>
                    change("allDayEndDate", dayKeyInZone(date, timezone))
                  }
                  mode="date"
                  timeZone={timezone}
                  locale={profile.locale}
                  disabled={busy || editingRepeat}
                />
              </>
            ) : (
              <>
                <DateTimeField
                  label="Mulai"
                  value={start.ok ? new Date(start.iso) : null}
                  onChange={(date) => {
                    const value = eventTimeInZone(date.toISOString(), timezone);
                    setDraft((current) => moveStart(current, value));
                  }}
                  timeZone={timezone}
                  locale={profile.locale}
                  disabled={busy || editingRepeat}
                />
                <FormDivider />
                <DateTimeField
                  label="Selesai"
                  value={end.ok ? new Date(end.iso) : null}
                  onChange={(date) =>
                    change(
                      "endAt",
                      eventTimeInZone(date.toISOString(), timezone)
                    )
                  }
                  timeZone={timezone}
                  locale={profile.locale}
                  disabled={busy || editingRepeat}
                />
              </>
            )}
          </FormCard>
          <Text variant="footnote" tone="muted">
            {formatZoneName(timezone)}
          </Text>
          <InlineError message={timeError ?? errors.end} />
        </View>
        {!editingOccurrence ? (
          <EventRepeatField
            value={draft.recurrence}
            onChange={(rules) => change("recurrence", rules)}
            startDay={startDay}
            allDay={draft.isAllDay}
            timezone={timezone}
            disabled={busy}
            onEditingChange={setEditingRepeat}
          />
        ) : null}
        <FormCard>
          {!event && status.data?.connected ? (
            <>
              <ListRow
                title="Simpan di"
                value={target === "google" ? "Google Calendar" : "Sydia"}
                onPress={() =>
                  showActions({
                    title: "Simpan di",
                    options: [
                      {
                        label: "Google Calendar",
                        onPress: () => setDestination("google"),
                      },
                      {
                        label: "Sydia",
                        onPress: () => setDestination("local"),
                      },
                    ],
                  })
                }
                disabled={busy}
              />
              <FormDivider />
            </>
          ) : null}
          <ListRow
            title="Pengingat"
            subtitle={
              event?.reminderMinutes == null && event && !reminderChanged
                ? "Ikuti pengaturan kalender"
                : reminderLabel(draft.reminderMinutes)
            }
            onPress={() =>
              showActions({
                title: "Ingatkan sebelum acara",
                options: EVENT_REMINDER_OPTIONS.map(({ label, value }) => ({
                  label,
                  onPress: () => {
                    change("reminderMinutes", value);
                    setReminderChanged(value !== event?.reminderMinutes);
                  },
                })),
              })
            }
            disabled={busy}
          />
          {google &&
          !event?.googleMeetUrl &&
          event?.googleMeetStatus !== "pending" ? (
            <>
              <FormDivider />
              <SwitchRow
                title="Tambahkan Google Meet"
                icon={Video}
                value={createMeet}
                onValueChange={setCreateMeet}
                disabled={busy}
              />
            </>
          ) : null}
        </FormCard>
        <TextField
          label="Lokasi"
          placeholder="Tambahkan tempat"
          value={draft.location}
          onChangeText={(location) => change("location", location)}
          maxLength={500}
          editable={!busy}
        />
        <TextField
          label="Peserta"
          placeholder="nama@contoh.com"
          hint="Pisahkan alamat email dengan koma."
          value={draft.attendees}
          onChangeText={(attendees) => change("attendees", attendees)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={errors.attendees}
          editable={!busy}
        />
        <FormCard>
          <ListRow
            title="Catatan"
            subtitle={
              draft.notes ||
              (note.kind === "editable" ? "Tambahkan catatan" : null)
            }
            icon={FileText}
            onPress={
              note.kind === "editable"
                ? () => setEditingNotes({ html: note.html })
                : undefined
            }
            disabled={busy || editingRepeat}
          />
          {note.kind === "unsupported" ? (
            <View style={styles.noteNotice}>
              <Text variant="footnote" tone="muted">
                Format catatan ini hanya dapat disunting di web.
              </Text>
            </View>
          ) : null}
        </FormCard>
        <InlineError
          message={
            writeError ?? resolve.error?.message ?? mutation.error?.message
          }
        />
        {!event ? <InlineError message={status.error?.message} /> : null}
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  noteNotice: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
