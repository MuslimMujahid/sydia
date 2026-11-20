import type { LucideIcon } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AuroraFill } from "@/components/ui/aurora";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "destructive";

interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.primaryForeground,
  outline: colors.foreground,
  ghost: colors.mutedForeground,
  destructive: colors.destructive,
};

/**
 * The four DESIGN.md button recipes plus a destructive outline. Use
 * `primary` (the grainy aurora) for at most one action per screen.
 */
export function Button({
  label,
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled) || loading;
  const color = LABEL_COLOR[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.small : styles.medium,
        styles[variant],
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {variant === "primary" ? <AuroraFill /> : null}
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.content}>
          {Icon ? (
            <Icon
              size={size === "sm" ? 16 : 18}
              color={color}
              strokeWidth={2}
            />
          ) : null}
          <Text
            variant={size === "sm" ? "footnote" : "callout"}
            weight={variant === "primary" ? "bold" : "semibold"}
            color={color}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

interface IconButtonProps extends Omit<PressableProps, "style" | "children"> {
  icon: LucideIcon;
  accessibilityLabel: string;
  variant?: "ghost" | "filled" | "primary" | "secondary";
  size?: number;
  iconSize?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** A round icon-only control; always pass an accessibility label. */
export function IconButton({
  icon: Icon,
  variant = "ghost",
  size = 40,
  iconSize,
  color,
  disabled,
  style,
  ...props
}: IconButtonProps) {
  const iconColor =
    color ??
    (variant === "primary"
      ? colors.white
      : variant === "secondary"
        ? colors.primaryForeground
        : colors.foreground);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      style={({ pressed }) => [
        styles.iconBase,
        { width: size, height: size, borderRadius: size / 2 },
        variant === "filled" && styles.iconFilled,
        variant === "secondary" && styles.secondary,
        variant === "primary" && styles.iconPrimary,
        pressed && (variant === "ghost" ? styles.ghostPressed : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {variant === "primary" ? <AuroraFill grain={false} /> : null}
      <Icon
        size={iconSize ?? Math.round(size * 0.5)}
        color={iconColor}
        strokeWidth={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  medium: { minHeight: 48, paddingHorizontal: 22 },
  small: { minHeight: 36, paddingHorizontal: spacing.lg },
  fullWidth: { alignSelf: "stretch" },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  primary: { boxShadow: shadows.button },
  secondary: { backgroundColor: colors.primary },
  outline: {
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: "transparent",
  },
  ghost: { backgroundColor: "transparent", paddingHorizontal: 18 },
  destructive: {
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.3)",
    backgroundColor: "transparent",
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  ghostPressed: { backgroundColor: colors.pressed },
  disabled: { opacity: 0.45 },
  iconBase: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconFilled: { backgroundColor: colors.muted },
  iconPrimary: { boxShadow: shadows.button },
});
