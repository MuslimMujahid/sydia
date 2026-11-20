import * as Haptics from "expo-haptics";
import { Check, Plus, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuroraFill } from "@/components/ui/aurora";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  leading?: ReactNode;
  accessibilityLabel?: string;
}

/** A filter or choice pill. Selected chips are graphite with a bone label. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  leading,
  accessibilityLabel,
}: ChipProps) {
  const color = selected ? colors.primaryForeground : colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      {leading}
      {Icon ? <Icon size={15} color={color} strokeWidth={2} /> : null}
      <Text
        variant="footnote"
        weight="semibold"
        color={color}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontally scrolling chip row that bleeds to the screen edges. */
export function ChipRow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      style={style}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

/** Two to four mutually exclusive views; the active one is a raised snow pill. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              variant="footnote"
              weight="semibold"
              tone={active ? "default" : "muted"}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface FabProps {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: LucideIcon;
}

/**
 * The screen's one primary create action, floating above the tab bar. The
 * safe-area wrapper picks up the native tab bar inset on both platforms.
 */
export function Fab({
  onPress,
  accessibilityLabel,
  icon: Icon = Plus,
}: FabProps) {
  return (
    <SafeAreaView
      edges={["bottom"]}
      style={styles.fabArea}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <AuroraFill />
        <Icon size={26} color={colors.white} strokeWidth={2.25} />
      </Pressable>
    </SafeAreaView>
  );
}

interface CheckCircleProps {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  color?: string;
  disabled?: boolean;
}

/** Round completion toggle for tasks, with a light haptic tick. */
export function CheckCircle({
  checked,
  onToggle,
  accessibilityLabel,
  color = colors.foreground,
  disabled,
}: CheckCircleProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
      style={[
        styles.check,
        { borderColor: checked ? color : colors.input },
        checked && { backgroundColor: color },
        disabled && styles.disabled,
      ]}
    >
      {checked ? (
        <Check size={14} color={colors.white} strokeWidth={3} />
      ) : null}
    </Pressable>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text
        variant={size >= 56 ? "headline" : "footnote"}
        weight="semibold"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {initials}
      </Text>
    </View>
  );
}

interface BadgeProps {
  label: string;
  background?: string;
  color?: string;
}

export function Badge({
  label,
  background = colors.muted,
  color = colors.foreground,
}: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text variant="caption" weight="semibold" color={color} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
  segmented: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  segment: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: spacing.sm,
  },
  segmentActive: { backgroundColor: colors.card, boxShadow: shadows.card },
  fabArea: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: shadows.button,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.75,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
