import { useId } from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { aurora } from "@/lib/theme";

const GRAIN = require("../../../assets/images/grain.png") as number;

interface AuroraFillProps {
  style?: StyleProp<ViewStyle>;
  /** Skip the grain layer for very small surfaces where it turns muddy. */
  grain?: boolean;
}

/**
 * The grainy aurora from DESIGN.md §2: a 135° amber→coral→violet base, three
 * radial blooms, and an alpha-only noise layer. It belongs only on the one
 * primary action of a screen and the featured hero surface.
 */
export function AuroraFill({ style, grain = true }: AuroraFillProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={`${id}base`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={aurora.base[0]} />
            <Stop offset="0.45" stopColor={aurora.base[1]} />
            <Stop offset="1" stopColor={aurora.base[2]} />
          </LinearGradient>
          <RadialGradient
            id={`${id}amber`}
            cx="0.12"
            cy="0.88"
            rx="0.9"
            ry="0.7"
            fx="0.12"
            fy="0.88"
          >
            <Stop offset="0" stopColor={aurora.amberBloom} stopOpacity="1" />
            <Stop offset="0.55" stopColor={aurora.amberBloom} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient
            id={`${id}violet`}
            cx="0.88"
            cy="0.12"
            rx="0.7"
            ry="0.8"
            fx="0.88"
            fy="0.12"
          >
            <Stop offset="0" stopColor={aurora.violetBloom} stopOpacity="1" />
            <Stop
              offset="0.55"
              stopColor={aurora.violetBloom}
              stopOpacity="0"
            />
          </RadialGradient>
          <RadialGradient
            id={`${id}coral`}
            cx="0.55"
            cy="0.5"
            rx="0.5"
            ry="0.6"
            fx="0.55"
            fy="0.5"
          >
            <Stop offset="0" stopColor={aurora.coralCore} stopOpacity="1" />
            <Stop offset="0.6" stopColor={aurora.coralCore} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id}base)`} />
        <Rect width="100" height="100" fill={`url(#${id}amber)`} />
        <Rect width="100" height="100" fill={`url(#${id}violet)`} />
        <Rect width="100" height="100" fill={`url(#${id}coral)`} />
      </Svg>
      {grain ? (
        <Image
          accessible={false}
          source={GRAIN}
          resizeMode="repeat"
          style={styles.grain}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grain: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
});
