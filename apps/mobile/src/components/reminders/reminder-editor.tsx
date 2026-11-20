import { usePreventRemove, useRouter } from "expo-router";
import {
  Bell,
  Clock,
  MessageSquare,
  Minus,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
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
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import type { Reminder } from "@/lib/services/api/reminders/reminders.api";
import {
  useAcknowledgeReminder,
  useCreateReminder,
  useDeleteReminder,
  useSnoozeReminder,
  useUpdateReminder,
} from "@/lib/services/api/reminders/reminders.queries";
import { spacing } from "@/lib/theme";
import {
  buildReminderInput,
  buildReminderUpdate,
  FREQUENCY_CHOICES,
  FREQUENCY_CHOICE_LABELS,
  FREQUENCY_UNITS,
  isAwaitingAcknowledgement,
  isReminderFormDirty,
  NOTES_MAX,
  OCCURRENCE_STATUS_LABELS,
  RECURRENCE_INTERVAL,
  reminderActionReason,
  reminderFormValues,
  repeatIntervalOptions,
  snoozedFromLabel,
  snoozePresets,
  timeActionFor,
  TITLE_MAX,
  validateReminderForm,
  WEEKDAY_SHORT,
  type ReminderFormValues,
} from "./reminder-view";

export function ReminderEditor({
  reminder,
  onClose,
}: {
  reminder?: Reminder;
  onClose: () => void;
}) {
  const { timezone, locale } = useProfile();
  const router = useRouter();
  const toast = useToast();
  const showActions = useActionSheet();
  const [initial] = useState(() => reminderFormValues(reminder));
  const [values, setValues] = useState(initial);
  const [quickTime, setQuickTime] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const acknowledge = useAcknowledgeReminder();
  const mutation = reminder ? update : create;
  const busy = mutation.isPending || remove.isPending || acknowledge.isPending;
  const errors = validateReminderForm(values);
  const dirty = isReminderFormDirty(initial, values);
  const allowRemoval = usePreventRemove(
    !quickTime && !leaving && (dirty || busy),
    ({ repeat }) => {
      if (busy) return;
      Alert.alert("Buang perubahan?", "Perubahan pengingat belum disimpan.", [
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

  function change<K extends keyof ReminderFormValues>(
    key: K,
    value: ReminderFormValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function finish() {
    setLeaving(true);
    allowRemoval();
    onClose();
  }

  function save() {
    if (busy || Object.keys(errors).length) return;
    if (reminder)
      update.mutate(
        {
          reminderId: reminder.id,
          values: buildReminderUpdate(initial, values),
        },
        { onSuccess: finish }
      );
    else create.mutate(buildReminderInput(values), { onSuccess: finish });
  }

  function confirmDelete() {
    if (!reminder || busy) return;
    Alert.alert(
      "Hapus pengingat ini?",
      `“${reminder.title}” akan dihapus permanen.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => remove.mutate(reminder.id, { onSuccess: finish }),
        },
      ]
    );
  }

  function toggleWeekday(day: number) {
    change(
      "daysOfWeek",
      values.daysOfWeek.includes(day)
        ? values.daysOfWeek.filter((value) => value !== day)
        : [...values.daysOfWeek, day]
    );
  }

  if (quickTime && reminder)
    return (
      <ReminderTimeEditor
        reminder={reminder}
        onCancel={() => setQuickTime(false)}
        onSaved={onClose}
      />
    );

  const frequency = values.frequency;
  const occurrence = reminder?.latestOccurrence;
  const occurrenceStatus = occurrence
    ? OCCURRENCE_STATUS_LABELS[occurrence.status]
    : null;
  const originId = reminder?.source?.conversationId;

  return (
    <>
      <FormHeader
        title={reminder ? "Pengingat" : "Pengingat baru"}
        onCancel={onClose}
        onSave={save}
        canSave={!busy && (!reminder || dirty) && !Object.keys(errors).length}
        saving={mutation.isPending}
      />
      <FormScroll>
        <TextField
          label="Judul"
          placeholder="Apa yang ingin diingat?"
          maxLength={TITLE_MAX}
          value={values.title}
          editable={!busy}
          onChangeText={(title) => change("title", title)}
        />
        <FormCard>
          <DateTimeField
            label="Waktu pengingat"
            value={values.scheduledAt}
            onChange={(date) => change("scheduledAt", date)}
            timeZone={timezone}
            locale={locale}
            disabled={busy}
          />
          <FormDivider />
          <ListRow
            title="Ulangi"
            icon={Repeat}
            value={FREQUENCY_CHOICE_LABELS[values.frequency]}
            disabled={busy}
            onPress={() =>
              showActions({
                title: "Ulangi pengingat",
                options: FREQUENCY_CHOICES.map((frequency) => ({
                  label: FREQUENCY_CHOICE_LABELS[frequency],
                  onPress: () => change("frequency", frequency),
                })),
              })
            }
          />
          {frequency !== "none" ? (
            <>
              <FormDivider />
              <ListRow
                title={`Setiap ${values.interval} ${FREQUENCY_UNITS[frequency]}`}
                trailing={
                  <View style={styles.stepper}>
                    <IconButton
                      icon={Minus}
                      accessibilityLabel="Kurangi interval"
                      disabled={
                        busy || values.interval <= RECURRENCE_INTERVAL.min
                      }
                      onPress={() => change("interval", values.interval - 1)}
                    />
                    <IconButton
                      icon={Plus}
                      accessibilityLabel="Tambah interval"
                      disabled={
                        busy || values.interval >= RECURRENCE_INTERVAL.max
                      }
                      onPress={() => change("interval", values.interval + 1)}
                    />
                  </View>
                }
              />
              {values.frequency === "weekly" ? (
                <View style={styles.weekdays}>
                  {WEEKDAY_SHORT.map((label, day) => (
                    <Chip
                      key={label}
                      label={label}
                      selected={values.daysOfWeek.includes(day)}
                      onPress={busy ? undefined : () => toggleWeekday(day)}
                    />
                  ))}
                </View>
              ) : null}
              <FormDivider />
              <DateTimeField
                label="Berakhir pada"
                placeholder="Tidak ada"
                value={values.endsAt}
                onChange={(date) => change("endsAt", date)}
                onClear={
                  values.endsAt ? () => change("endsAt", null) : undefined
                }
                timeZone={timezone}
                locale={locale}
                disabled={busy}
              />
            </>
          ) : null}
        </FormCard>
        <InlineError message={errors.scheduledAt ?? errors.endsAt} />
        <FormCard>
          <SwitchRow
            value={values.important}
            onValueChange={(important) => change("important", important)}
            title="Pengingat penting"
            subtitle="Kirim berulang sampai dikonfirmasi."
            icon={Bell}
            disabled={busy}
          />
          {values.important ? (
            <>
              <FormDivider />
              <ListRow
                title="Kirim ulang setiap"
                value={`${values.repeatIntervalMinutes} menit`}
                disabled={busy}
                onPress={() =>
                  showActions({
                    title: "Kirim ulang setiap",
                    options: repeatIntervalOptions(
                      values.repeatIntervalMinutes
                    ).map(({ label, value }) => ({
                      label,
                      onPress: () => change("repeatIntervalMinutes", value),
                    })),
                  })
                }
              />
            </>
          ) : null}
        </FormCard>
        <TextField
          label="Catatan"
          placeholder="Tambahkan catatan"
          multiline
          maxLength={NOTES_MAX}
          value={values.notes}
          editable={!busy}
          onChangeText={(notes) => change("notes", notes)}
        />
        {reminder ? (
          <>
            <FormCard>
              {occurrenceStatus ? (
                <ListRow title="Status pengiriman" value={occurrenceStatus} />
              ) : null}
              {reminder.snoozedFrom ? (
                <ListRow
                  title={snoozedFromLabel(reminder, timezone) ?? "Ditunda"}
                />
              ) : null}
              {isAwaitingAcknowledgement(reminder) ? (
                <ListRow
                  title="Konfirmasi pengingat"
                  icon={Bell}
                  disabled={busy || dirty}
                  onPress={() =>
                    acknowledge.mutate(
                      { reminderId: reminder.id, occurrenceId: occurrence?.id },
                      { onSuccess: () => toast("Pengingat dikonfirmasi") }
                    )
                  }
                />
              ) : null}
              <ListRow
                title={
                  timeActionFor(reminder) === "snooze"
                    ? "Tunda pengingat"
                    : "Jadwalkan ulang"
                }
                icon={Clock}
                disabled={busy || dirty}
                onPress={() => setQuickTime(true)}
              />
              {originId ? (
                <ListRow
                  title="Buka percakapan asal"
                  icon={MessageSquare}
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: "/chat/[id]",
                      params: { id: originId },
                    })
                  }
                />
              ) : null}
              <FormDivider />
              <ListRow
                title="Hapus pengingat"
                icon={Trash2}
                destructive
                disabled={busy}
                onPress={confirmDelete}
              />
            </FormCard>
            {dirty ? (
              <Text variant="footnote" tone="muted">
                Simpan perubahan untuk menunda atau mengonfirmasi pengingat.
              </Text>
            ) : null}
          </>
        ) : null}
        <InlineError
          message={
            mutation.error?.message ??
            remove.error?.message ??
            acknowledge.error?.message
          }
        />
      </FormScroll>
    </>
  );
}

function ReminderTimeEditor({
  reminder,
  onCancel,
  onSaved,
}: {
  reminder: Reminder;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { timezone, locale } = useProfile();
  const toast = useToast();
  const snoozing = timeActionFor(reminder) === "snooze";
  const [openedAt] = useState(() => new Date());
  const [presets] = useState(() => snoozePresets(openedAt, timezone));
  const [value, setValue] = useState(() =>
    snoozing
      ? new Date(openedAt.getTime() + 15 * 60_000)
      : new Date(reminder.scheduledAt)
  );
  const snooze = useSnoozeReminder();
  const update = useUpdateReminder();
  const mutation = snoozing ? snooze : update;
  const title = snoozing ? "Tunda pengingat" : "Jadwalkan ulang";
  const [leaving, setLeaving] = useState(false);
  const allowRemoval = usePreventRemove(!leaving, () => {
    if (!mutation.isPending) onCancel();
  });

  function finish() {
    setLeaving(true);
    allowRemoval();
    onSaved();
  }

  function submitSnooze(at: Date, confirmed = false) {
    snooze.mutate(
      {
        reminderId: reminder.id,
        occurrenceId: reminder.latestOccurrence?.id,
        until: at.toISOString(),
        confirmPastNextOccurrence: confirmed,
      },
      {
        onSuccess: () => {
          toast("Pengingat ditunda");
          finish();
        },
        onError: (error) => {
          console.warn("Reminder snooze failed", {
            reason: reminderActionReason(error),
          });
          if (reminderActionReason(error) !== "needs_confirmation" || confirmed)
            return;
          Alert.alert("Lewati jadwal berikutnya?", error.message, [
            { text: "Batal", style: "cancel" },
            { text: "Lanjutkan", onPress: () => submitSnooze(at, true) },
          ]);
        },
      }
    );
  }

  function save() {
    if (mutation.isPending) return;
    if (snoozing) return submitSnooze(value);
    update.mutate(
      { reminderId: reminder.id, values: { scheduledAt: value.toISOString() } },
      { onSuccess: finish }
    );
  }

  return (
    <>
      <FormHeader
        title={title}
        onCancel={onCancel}
        onSave={save}
        canSave={!mutation.isPending}
        saving={mutation.isPending}
      />
      <FormScroll>
        <Text variant="headline">{reminder.title}</Text>
        {snoozing ? (
          <View style={styles.weekdays}>
            {presets.map((preset) => (
              <Chip
                key={preset.key}
                label={preset.label}
                selected={preset.at.getTime() === value.getTime()}
                onPress={
                  mutation.isPending ? undefined : () => setValue(preset.at)
                }
              />
            ))}
          </View>
        ) : null}
        <FormCard>
          <DateTimeField
            label="Waktu baru"
            value={value}
            onChange={setValue}
            timeZone={timezone}
            locale={locale}
            disabled={mutation.isPending}
          />
        </FormCard>
        <InlineError message={mutation.error?.message} />
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  weekdays: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  stepper: { flexDirection: "row", gap: spacing.xs },
});
