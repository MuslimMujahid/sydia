import { StyleSheet, Text as NativeText, type TextProps } from "react-native";
import { fonts, type FontWeight } from "@/lib/fonts";
import { colors } from "@/lib/theme";

/**
 * Type scale adapted from DESIGN.md for phone screens: Inter throughout,
 * JetBrains Mono for numbers and metadata.
 */
const VARIANTS = StyleSheet.create({
  display: { fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  title: { fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  headline: { fontSize: 19, lineHeight: 25, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: -0.08 },
  callout: { fontSize: 15, lineHeight: 21, letterSpacing: -0.05 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  mono: { fontSize: 13, lineHeight: 18 },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});

export type TextVariant = keyof typeof VARIANTS;

const DEFAULT_WEIGHT: Record<TextVariant, FontWeight> = {
  display: "bold",
  title: "bold",
  headline: "semibold",
  body: "regular",
  callout: "regular",
  footnote: "regular",
  caption: "medium",
  mono: "regular",
  eyebrow: "semibold",
};

export type TextTone =
  "default" | "muted" | "accent" | "destructive" | "inverse" | "white";

const TONES: Record<TextTone, string> = {
  default: colors.foreground,
  muted: colors.mutedForeground,
  accent: colors.accent,
  destructive: colors.destructive,
  inverse: colors.primaryForeground,
  white: colors.white,
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  weight?: FontWeight;
  tone?: TextTone;
  /** Overrides `tone` with an explicit color token. */
  color?: string;
  align?: "left" | "center" | "right";
}

function familyFor(variant: TextVariant, weight: FontWeight) {
  if (variant === "mono")
    return weight === "regular" ? fonts.mono : fonts.monoMedium;

  return fonts[weight];
}

/** The app's only text primitive; it keeps custom fonts consistent per weight. */
export function Text({
  variant = "body",
  weight,
  tone = "default",
  color,
  align,
  style,
  ...props
}: AppTextProps) {
  return (
    <NativeText
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[
        VARIANTS[variant],
        {
          fontFamily: familyFor(variant, weight ?? DEFAULT_WEIGHT[variant]),
          color: color ?? TONES[tone],
        },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
