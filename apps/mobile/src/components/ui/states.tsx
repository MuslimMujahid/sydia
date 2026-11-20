import { RotateCcw, TriangleAlert } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
  useAnimatedValue,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { colors, radius, spacing } from "@/lib/theme";

export function LoadingState({ label = "Memuat…" }: { label?: string }) {
  return (
    <View
      style={styles.center}
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator color={colors.mutedForeground} />
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Recoverable failure: says what broke and offers the retry. */
export function ErrorState({
  title = "Tidak dapat dimuat",
  message,
  onRetry,
  retryLabel = "Coba lagi",
}: ErrorStateProps) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <TriangleAlert size={26} color={colors.destructive} strokeWidth={1.75} />
      <Text variant="headline" align="center">
        {title}
      </Text>
      <Text variant="callout" tone="muted" align="center">
        {message}
      </Text>
      {onRetry ? (
        <Button
          label={retryLabel}
          icon={RotateCcw}
          variant="outline"
          size="sm"
          onPress={onRetry}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.center}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text variant="headline" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" tone="muted" align="center">
          {message}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A pulsing placeholder block; motion stays under the 200ms-feel budget. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius: borderRadius = 6,
  style,
}: SkeletonProps) {
  const opacity = useAnimatedValue(0.55);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.skeleton, { width, height, borderRadius, opacity }, style]}
    />
  );
}

/** A stack of row skeletons for list screens. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View
      style={styles.listSkeleton}
      accessibilityLabel="Memuat"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={28} height={28} radius={14} />
          <View style={styles.skeletonTexts}>
            <Skeleton width={index % 2 ? "70%" : "85%"} height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <TriangleAlert size={16} color={colors.destructive} strokeWidth={2} />
      <Text variant="footnote" tone="destructive" style={styles.inlineText}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.huge,
  },
  action: { marginTop: spacing.md, alignSelf: "center" },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  skeleton: { backgroundColor: colors.muted },
  listSkeleton: { gap: spacing.xl, padding: spacing.xl },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  skeletonTexts: { flex: 1, gap: spacing.sm },
  inlineError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.destructiveSoft,
  },
  inlineText: { flex: 1 },
});
