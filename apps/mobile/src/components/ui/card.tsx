import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { colors, radius, shadows, spacing } from "@/lib/theme";

interface CardProps extends ViewProps {
  padded?: boolean;
}

/** Snow card with the DESIGN.md hairline and soft card shadow. */
export function Card({ padded = true, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...props} />
  );
}

interface PressableCardProps extends Omit<PressableProps, "style"> {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PressableCard({
  padded = true,
  style,
  ...props
}: PressableCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        padded && styles.padded,
        pressed && styles.pressed,
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.card,
  },
  padded: { padding: spacing.xl },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
