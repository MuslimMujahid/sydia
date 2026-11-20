import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";

interface ListSectionProps {
  title?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * An inset grouped list: rows on one snow card, separated by hairlines. The
 * native settings pattern on both platforms, styled with Aurora Haze tokens.
 */
export function ListSection({
  title,
  footer,
  children,
  style,
}: ListSectionProps) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Text
          variant="footnote"
          weight="semibold"
          tone="muted"
          style={styles.title}
        >
          {title}
        </Text>
      ) : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" tone="muted" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string | null;
  /** Short trailing text such as a current value. */
  value?: string | null;
  icon?: LucideIcon;
  /** A custom leading element (glyph, avatar, checkbox). */
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  titleLines?: number;
  accessibilityLabel?: string;
}

export function ListRow({
  title,
  subtitle,
  value,
  icon: Icon,
  leading,
  trailing,
  onPress,
  onLongPress,
  chevron = Boolean(onPress),
  destructive = false,
  disabled = false,
  titleLines = 1,
  accessibilityLabel,
}: ListRowProps) {
  const tint = destructive ? colors.destructive : colors.foreground;
  const content = (
    <>
      {leading ??
        (Icon ? (
          <View style={styles.iconWell}>
            <Icon size={18} color={tint} strokeWidth={1.75} />
          </View>
        ) : null)}
      <View style={styles.texts}>
        <Text
          variant="body"
          weight="medium"
          color={tint}
          numberOfLines={titleLines}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          variant="callout"
          tone="muted"
          numberOfLines={1}
          style={styles.value}
        >
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ? (
        <ChevronRight
          size={18}
          color={colors.mutedForeground}
          strokeWidth={2}
        />
      ) : null}
    </>
  );

  if (!onPress && !onLongPress)
    return (
      <View style={styles.row} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

interface SwitchRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  icon,
  disabled,
}: SwitchRowProps) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      chevron={false}
      accessibilityLabel={title}
      trailing={
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: colors.accent, false: colors.input }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.input}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.lg },
  footer: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.card,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.pressed },
  disabled: { opacity: 0.45 },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, gap: 2 },
  value: { maxWidth: "45%" },
});
