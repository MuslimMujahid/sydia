import { Repeat } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import { FormCard, FormDivider } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import { TextField } from "@/components/ui/text-field";
import { useProfile } from "@/lib/profile";
import { spacing } from "@/lib/theme";
import { dayKeyInZone, isDayKey, zonedMidnightMs } from "./calendar-date";
import {
  customRecurrence,
  describeRecurrence,
  initialCustomRepeat,
  presetRecurrence,
  REPEAT_DAY_LABELS,
  REPEAT_DAYS,
  REPEAT_LABELS,
  type CustomRepeat,
  type RepeatFrequency,
  type RepeatPreset,
} from "./event-recurrence";

const PRESETS: RepeatPreset[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekdays",
  "custom",
];
const FREQUENCIES: { value: RepeatFrequency; label: string }[] = [
  { value: "DAILY", label: "Harian" },
  { value: "WEEKLY", label: "Mingguan" },
  { value: "MONTHLY", label: "Bulanan" },
  { value: "YEARLY", label: "Tahunan" },
];
const END_LABELS: Record<CustomRepeat["end"], string> = {
  never: "Tidak pernah",
  count: "Setelah beberapa kali",
  date: "Pada tanggal",
};
const ENDS: CustomRepeat["end"][] = ["never", "count", "date"];

type RepeatFieldProps = {
  value: string[];
  onChange: (rules: string[]) => void;
  startDay: string;
  allDay: boolean;
  timezone: string;
  disabled: boolean;
  onEditingChange: (editing: boolean) => void;
};

export function EventRepeatField({
  value,
  onChange,
  startDay,
  allDay,
  timezone,
  disabled,
  onEditingChange,
}: RepeatFieldProps) {
  const showActions = useActionSheet();
  const { locale } = useProfile();
  const [draft, setDraft] = useState<CustomRepeat>();
  const [interval, setIntervalDraft] = useState("1");
  const [count, setCount] = useState("10");

  function selectPreset(preset: RepeatPreset) {
    if (preset !== "custom") {
      onChange(presetRecurrence(preset));
      return;
    }
    const custom = initialCustomRepeat(value, startDay, timezone);
    setDraft(custom);
    setIntervalDraft(String(custom.interval));
    setCount(String(custom.count));
    onEditingChange(true);
  }

  function closeCustom() {
    setDraft(undefined);
    onEditingChange(false);
  }

  const intervalNumber = Number(interval);
  const countNumber = Number(count);
  const validInterval =
    /^\d+$/.test(interval) && intervalNumber >= 1 && intervalNumber <= 999;
  const validCount =
    /^\d+$/.test(count) && countNumber >= 1 && countNumber <= 9999;
  const validEnd =
    draft?.end !== "date" || (isDayKey(draft.until) && draft.until >= startDay);
  const canApply =
    validInterval && validEnd && (draft?.end !== "count" || validCount);

  return (
    <FormCard>
      <ListRow
        title="Ulangi"
        subtitle={describeRecurrence(value, timezone)}
        icon={Repeat}
        disabled={disabled || Boolean(draft)}
        onPress={() =>
          showActions({
            title: "Ulangi acara",
            options: PRESETS.map((preset) => ({
              label: REPEAT_LABELS[preset],
              onPress: () => selectPreset(preset),
            })),
          })
        }
      />
      {draft ? (
        <>
          <FormDivider />
          <ListRow
            title="Frekuensi"
            value={
              FREQUENCIES.find((option) => option.value === draft.frequency)
                ?.label
            }
            onPress={() =>
              showActions({
                title: "Frekuensi",
                options: FREQUENCIES.map(({ value, label }) => ({
                  label,
                  onPress: () => setDraft({ ...draft, frequency: value }),
                })),
              })
            }
          />
          <View style={styles.field}>
            <TextField
              label="Interval"
              keyboardType="number-pad"
              value={interval}
              maxLength={3}
              onChangeText={setIntervalDraft}
              error={validInterval ? undefined : "Masukkan 1–999."}
            />
            {draft.frequency === "WEEKLY" ? (
              <View style={styles.choices}>
                {REPEAT_DAYS.map((day, index) => (
                  <Chip
                    key={day}
                    label={REPEAT_DAY_LABELS[index]!}
                    selected={draft.days.includes(day)}
                    onPress={() =>
                      setDraft({
                        ...draft,
                        days: draft.days.includes(day)
                          ? draft.days.filter((item) => item !== day)
                          : [...draft.days, day],
                      })
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
          <FormDivider />
          <ListRow
            title="Berakhir"
            value={END_LABELS[draft.end]}
            onPress={() =>
              showActions({
                title: "Akhiri pengulangan",
                options: ENDS.map((end) => ({
                  label: END_LABELS[end],
                  onPress: () => setDraft({ ...draft, end }),
                })),
              })
            }
          />
          {draft.end === "count" ? (
            <View style={styles.field}>
              <TextField
                label="Jumlah kejadian"
                keyboardType="number-pad"
                value={count}
                maxLength={4}
                onChangeText={setCount}
                error={validCount ? undefined : "Masukkan 1–9.999."}
              />
            </View>
          ) : null}
          {draft.end === "date" ? (
            <DateTimeField
              label="Sampai tanggal"
              timeZone={timezone}
              locale={locale}
              mode="date"
              minimumDate={new Date(zonedMidnightMs(startDay, timezone))}
              value={
                isDayKey(draft.until)
                  ? new Date(zonedMidnightMs(draft.until, timezone))
                  : null
              }
              onChange={(date) =>
                setDraft({ ...draft, until: dayKeyInZone(date, timezone) })
              }
            />
          ) : null}
          <View style={styles.choicesButtons}>
            <Button label="Batal" variant="ghost" onPress={closeCustom} />
            <Button
              label="Terapkan pengulangan"
              variant="secondary"
              disabled={!canApply}
              onPress={() => {
                onChange(
                  customRecurrence(
                    { ...draft, interval: intervalNumber, count: countNumber },
                    allDay,
                    timezone
                  )
                );
                closeCustom();
              }}
            />
          </View>
        </>
      ) : null}
    </FormCard>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.md, padding: spacing.md },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choicesButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
  },
});
