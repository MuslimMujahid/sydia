import { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import { colors, radius, spacing } from "@/lib/theme";

const LENGTH = 6;

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
}

/**
 * Six-digit one-time code. One hidden input drives six boxes, so SMS/email
 * autofill (`oneTimeCode`) and paste both fill the whole code at once.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
}: CodeInputProps) {
  const inputRef = useRef<TextInputInstance>(null);

  return (
    <Pressable
      accessibilityLabel="Kode verifikasi 6 digit"
      onPress={() => inputRef.current?.focus()}
      style={styles.row}
    >
      {Array.from({ length: LENGTH }, (_, index) => {
        const digit = value[index] ?? "";
        const active = index === Math.min(value.length, LENGTH - 1);

        return (
          <View key={index} style={[styles.box, active && styles.active]}>
            <Text variant="title" weight="semibold" style={styles.digit}>
              {digit}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        caretHidden
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, LENGTH);
          onChange(digits);
          if (digits.length === LENGTH) onComplete?.(digits);
        }}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    maxWidth: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  active: { borderColor: colors.accent },
  digit: { fontFamily: fonts.monoMedium },
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
