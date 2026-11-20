import { useEffect } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  useAnimatedValue,
} from "react-native";
import { AuroraFill } from "@/components/ui/aurora";

/**
 * "Sydia at work" (DESIGN.md §11): a small aurora orb that breathes while an
 * answer is pending. It holds still when the user prefers reduced motion.
 */
export function AuroraOrb({ size = 18 }: { size?: number }) {
  const pulse = useAnimatedValue(0);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.75, 1],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.86, 1.08],
              }),
            },
            {
              rotate: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "40deg"],
              }),
            },
          ],
        },
      ]}
    >
      <AuroraFill grain={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: { overflow: "hidden" },
});
