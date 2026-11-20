import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { useRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Text } from "@/components/ui/text";
import { colors, spacing } from "@/lib/theme";

export type SwipeAction = {
  label: string;
  icon: LucideIcon;
  /** Panel fill behind the row. */
  color: string;
  onTrigger: () => void;
};

interface SwipeRowProps {
  /** Revealed by swiping right (e.g. complete). */
  left?: SwipeAction;
  /** Revealed by swiping left (e.g. delete). */
  right?: SwipeAction;
  enabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const ACTION_WIDTH = 92;

function ActionPanel({
  action,
  side,
}: {
  action: SwipeAction;
  side: "left" | "right";
}) {
  const Icon = action.icon;

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: action.color },
        side === "left" ? styles.panelLeft : styles.panelRight,
      ]}
    >
      <Icon size={20} color={colors.white} strokeWidth={2.2} />
      <Text variant="caption" weight="semibold" tone="white" numberOfLines={1}>
        {action.label}
      </Text>
    </View>
  );
}

/**
 * A list row with full-swipe actions: swiping past the panel runs the action
 * (with a haptic tick) and the row springs back. Screen readers reach the
 * same actions through the row's long-press menu and accessibility actions.
 */
export function SwipeRow({
  left,
  right,
  enabled = true,
  containerStyle,
  children,
}: SwipeRowProps) {
  const swipeable = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      enabled={enabled}
      friction={1.6}
      leftThreshold={ACTION_WIDTH * 0.55}
      rightThreshold={ACTION_WIDTH * 0.55}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={containerStyle}
      renderLeftActions={
        left ? () => <ActionPanel action={left} side="left" /> : undefined
      }
      renderRightActions={
        right ? () => <ActionPanel action={right} side="right" /> : undefined
      }
      onSwipeableOpen={(direction) => {
        // The row moved right when the left panel opened.
        const action = direction === SwipeDirection.RIGHT ? left : right;
        swipeable.current?.close();
        if (!action) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        action.onTrigger();
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  panelLeft: { alignSelf: "stretch" },
  panelRight: { alignSelf: "stretch" },
});
