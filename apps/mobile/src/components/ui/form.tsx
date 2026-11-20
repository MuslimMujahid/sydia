import { Stack } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";

interface HeaderTextButtonProps {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
}

/** A text action for native headers (Batal, Simpan, Ubah). */
export function HeaderTextButton({
  label,
  onPress,
  emphasis = false,
  disabled = false,
  loading = false,
  destructive = false,
}: HeaderTextButtonProps) {
  if (loading)
    return (
      <ActivityIndicator
        color={colors.foreground}
        style={styles.headerSpinner}
      />
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerButton,
        (pressed || disabled) && styles.dim,
      ]}
    >
      <Text
        variant="body"
        weight={emphasis ? "semibold" : "regular"}
        color={
          destructive
            ? colors.destructive
            : emphasis
              ? colors.accent
              : colors.foreground
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface FormHeaderProps {
  title?: string;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  canSave: boolean;
  saving: boolean;
}

/** Batal on the left, Simpan on the right: the native modal form header. */
export function FormHeader({
  title,
  onCancel,
  onSave,
  saveLabel = "Simpan",
  canSave,
  saving,
}: FormHeaderProps) {
  return (
    <Stack.Screen
      options={{
        ...(title ? { title } : {}),
        headerLeft: () => (
          <HeaderTextButton
            label="Batal"
            onPress={onCancel}
            disabled={saving}
          />
        ),
        headerRight: () => (
          <HeaderTextButton
            label={saveLabel}
            emphasis
            onPress={onSave}
            disabled={!canSave}
            loading={saving}
          />
        ),
      }}
    />
  );
}

interface FormScrollProps {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Keyboard-aware scrolling body for forms and detail screens. */
export function FormScroll({ children, contentStyle }: FormScrollProps) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={[styles.content, contentStyle]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A snow card that groups form rows (title input, date rows, toggles). */
export function FormCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function FormDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.huge,
  },
  headerButton: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  headerSpinner: { paddingHorizontal: spacing.sm },
  dim: { opacity: 0.4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.card,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
});
