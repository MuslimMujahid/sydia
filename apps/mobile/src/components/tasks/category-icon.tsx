import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type {
  CategoryColor,
  CategoryIconKey,
} from "@/lib/services/api/categories/categories.api";
import { categoryColors, radius } from "@/lib/theme";

export const CATEGORY_COLORS: CategoryColor[] = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "orange",
];

export const CATEGORY_ICON_KEYS: CategoryIconKey[] = [
  "briefcase",
  "heart",
  "wallet",
  "book",
  "health",
  "family",
  "shopping",
  "star",
  "home",
  "travel",
];

export const CATEGORY_COLOR_LABELS: Record<CategoryColor, string> = {
  blue: "biru",
  violet: "ungu",
  emerald: "hijau",
  amber: "kuning",
  rose: "merah muda",
  cyan: "toska",
  orange: "oranye",
};

export const CATEGORY_ICON_LABELS: Record<CategoryIconKey, string> = {
  briefcase: "tas kerja",
  heart: "hati",
  wallet: "dompet",
  book: "buku",
  health: "kesehatan",
  family: "keluarga",
  shopping: "belanja",
  star: "bintang",
  home: "rumah",
  travel: "perjalanan",
};

/** The web's category glyphs (24px grid, 1.7 stroke, one tinted fill). */
function paths(iconKey: CategoryIconKey, color: string): ReactNode {
  switch (iconKey) {
    case "briefcase":
      return (
        <>
          <Path d="M4 8h16v10H4z" fill={color} opacity={0.22} />
          <Path d="M9 8V5h6v3M4 12h16M10 12v2h4v-2" />
        </>
      );
    case "heart":
      return (
        <Path
          d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.5 12 20 12 20Z"
          fill={color}
          opacity={0.28}
        />
      );
    case "wallet":
      return (
        <>
          <Path d="M4 6h14v13H4z" fill={color} opacity={0.2} />
          <Path d="M4 9h16v8H4M15 13h2" />
        </>
      );
    case "book":
      return (
        <>
          <Path
            d="M3 5h7a2 2 0 0 1 2 2v12a3 3 0 0 0-3-3H3z"
            fill={color}
            opacity={0.2}
          />
          <Path d="M21 5h-7a2 2 0 0 0-2 2v12a3 3 0 0 1 3-3h6z" />
        </>
      );
    case "health":
      return (
        <>
          <Circle cx="12" cy="12" r="9" fill={color} opacity={0.18} />
          <Path d="M12 7v10M7 12h10" />
        </>
      );
    case "family":
      return (
        <>
          <Circle cx="8" cy="9" r="3" fill={color} opacity={0.3} />
          <Circle cx="16" cy="9" r="3" />
          <Path d="M3 19c.5-4 9.5-4 10 0M11 19c.5-4 9.5-4 10 0" />
        </>
      );
    case "shopping":
      return (
        <>
          <Path d="M5 8h14l-1 12H6z" fill={color} opacity={0.22} />
          <Path d="M9 9V6a3 3 0 0 1 6 0v3" />
        </>
      );
    case "star":
      return (
        <Path
          d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"
          fill={color}
          opacity={0.3}
        />
      );
    case "home":
      return (
        <>
          <Path d="m3 11 9-8 9 8v10H3z" fill={color} opacity={0.2} />
          <Path d="M9 21v-7h6v7" />
        </>
      );
    case "travel":
      return (
        <>
          <Path d="m3 13 18-7-6 15-3-6z" fill={color} opacity={0.22} />
          <Path d="m12 15 9-9" />
        </>
      );
  }
}

interface CategoryIconProps {
  iconKey: CategoryIconKey;
  color: CategoryColor;
  /** Outer tile size; the glyph scales with it. */
  size?: number;
  round?: boolean;
}

/** A category's glyph on its tinted tile, as on the web. */
export function CategoryIcon({
  iconKey,
  color,
  size = 28,
  round = false,
}: CategoryIconProps) {
  const palette = categoryColors[color];
  const glyph = Math.round(size * 0.68);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : Math.min(radius.sm, size / 3),
          backgroundColor: palette.background,
        },
      ]}
    >
      <Svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke={palette.foreground}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths(iconKey, palette.foreground)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
