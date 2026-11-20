import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { CalendarDays, Clock3, X } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { colors, radius, spacing } from "@/lib/theme";
import {
  formatDayInZone,
  formatTimeInZone,
  roundUpToMinutes,
} from "@/lib/utils/date-time";

export type DateTimeMode = "date" | "time" | "datetime";

interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (value: Date) => void;
  /** Shows a clear button when set; the field then reads "Tidak ada". */
  onClear?: () => void;
  mode?: DateTimeMode;
  /** IANA zone the picker edits in, normally the profile time zone. */
  timeZone: string;
  locale?: SupportedLocale;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
}

/**
 * A native date/time row. iOS shows the system's compact picker inline;
 * Android opens the Material date dialog, then the time dialog.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  onClear,
  mode = "datetime",
  timeZone,
  locale = "id",
  placeholder = "Pilih",
  minimumDate,
  maximumDate,
  disabled = false,
}: DateTimeFieldProps) {
  const fallback = roundUpToMinutes(new Date(), 30);

  function openAndroid(step: "date" | "time", base: Date) {
    DateTimePickerAndroid.open({
      value: base,
      mode: step,
      is24Hour: true,
      timeZoneName: timeZone,
      minimumDate: step === "date" ? minimumDate : undefined,
      maximumDate: step === "date" ? maximumDate : undefined,
      onValueChange: (_event, picked) => {
        if (step === "date" && mode === "datetime") {
          // Let the date dialog close before the time dialog opens.
          setTimeout(() => openAndroid("time", picked), 50);
          onChange(picked);
          return;
        }
        onChange(picked);
      },
    });
  }

  const display = value
    ? mode === "date"
      ? formatDayInZone(value, timeZone, locale)
      : mode === "time"
        ? formatTimeInZone(value, timeZone, locale)
        : `${formatDayInZone(value, timeZone, locale)}, ${formatTimeInZone(value, timeZone, locale)}`
    : placeholder;

  const Icon = mode === "time" ? Clock3 : CalendarDays;

  if (Platform.OS === "ios" && value) {
    return (
      <View style={styles.row}>
        <Icon size={18} color={colors.mutedForeground} strokeWidth={1.75} />
        <Text variant="body" weight="medium" style={styles.label}>
          {label}
        </Text>
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          timeZoneName={timeZone}
          locale={locale === "en" ? "en-US" : "id-ID"}
          accentColor={colors.accent}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          disabled={disabled}
          onValueChange={(_event, picked) => onChange(picked)}
        />
        {onClear ? <ClearButton label={label} onClear={onClear} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Icon size={18} color={colors.mutedForeground} strokeWidth={1.75} />
      <Text variant="body" weight="medium" style={styles.label}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        disabled={disabled}
        onPress={() => {
          const base = value ?? fallback;
          if (Platform.OS === "android")
            openAndroid(mode === "time" ? "time" : "date", base);
          // iOS: the first tap sets a value, which reveals the compact picker.
          else onChange(base);
        }}
        style={({ pressed }) => [styles.value, pressed && styles.pressed]}
      >
        <Text
          variant="callout"
          weight="medium"
          tone={value ? "default" : "muted"}
          numberOfLines={1}
        >
          {display}
        </Text>
      </Pressable>
      {onClear && value ? (
        <ClearButton label={label} onClear={onClear} />
      ) : null}
    </View>
  );
}

function ClearButton({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Hapus ${label.toLowerCase()}`}
      hitSlop={10}
      onPress={onClear}
      style={styles.clear}
    >
      <X size={16} color={colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: { flex: 1 },
  value: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    maxWidth: "62%",
  },
  pressed: { opacity: 0.7 },
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
  },
});
