import { forwardRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import { colors, radius, spacing } from "@/lib/theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Labelled input on a snow surface; focus draws the coral ring. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(
  function TextField(
    {
      label,
      hint,
      error,
      containerStyle,
      style,
      multiline,
      onFocus,
      onBlur,
      ...inputProps
    },
    ref
  ) {
    const [focused, setFocused] = useState(false);

    return (
      <View style={[styles.field, containerStyle]}>
        {label ? (
          <Text variant="footnote" weight="medium">
            {label}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            multiline && styles.multiline,
            focused && styles.focused,
            error ? styles.invalid : null,
            style,
          ]}
          {...inputProps}
        />
        {error ? (
          <Text variant="footnote" tone="destructive" accessibilityRole="alert">
            {error}
          </Text>
        ) : hint ? (
          <Text variant="footnote" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  field: { gap: spacing.xs + 2 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  multiline: { minHeight: 112, paddingTop: spacing.md },
  focused: { borderColor: colors.accent },
  invalid: { borderColor: colors.destructive },
});
