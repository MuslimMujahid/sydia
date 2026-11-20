/**
 * Aurora Haze tokens for the native app, mirrored from DESIGN.md and
 * apps/frontend/src/styles/globals.css. Use these values instead of literals.
 */
export const colors = {
  /** Bone page background. */
  background: "#fbf8f5",
  /** Snow surface for cards, sheets, and inputs. */
  card: "#ffffff",
  foreground: "#171419",
  primary: "#171419",
  primaryForeground: "#fbf8f5",
  /** Ink 55: secondary text, mono labels, and resting icons. */
  mutedForeground: "#6b6470",
  /** Coral: active state only (selected tab, caret, selected row dot). */
  accent: "#ef5a8a",
  accentForeground: "#ffffff",
  /** Coral at 8% on snow, the user's own message bubble. */
  accentSoft: "rgba(239, 90, 138, 0.08)",
  accentSoftStrong: "rgba(239, 90, 138, 0.15)",
  success: "#065f46",
  successSoft: "#ecfdf5",
  destructive: "#dc2626",
  destructiveSoft: "rgba(220, 38, 38, 0.08)",
  /** Divider hairline. */
  border: "rgba(23, 20, 25, 0.08)",
  /** Card outline hairline. */
  cardBorder: "rgba(23, 20, 25, 0.06)",
  input: "rgba(23, 20, 25, 0.16)",
  /** Surface 1: skeletons, quiet fills, and pressed rows. */
  muted: "rgba(23, 20, 25, 0.06)",
  pressed: "rgba(23, 20, 25, 0.05)",
  overlay: "rgba(23, 20, 25, 0.4)",
  white: "#ffffff",
  /** Aurora stops: glyph accents and the grainy gradient. */
  amber: "#ff8a4c",
  coral: "#ef5a8a",
  violet: "#8c5cff",
} as const;

/** The aurora gradient stops from DESIGN.md §2. */
export const aurora = {
  base: ["#ffb27a", "#f06694", "#8c5cff"] as const,
  amberBloom: "#ff8a4c",
  violetBloom: "#c47bff",
  coralCore: "#ff6b9b",
} as const;

/**
 * Entity tints shared with the web chat pills (Tailwind 50/800 pairs), used
 * wherever a task, reminder, file, event, or note is referenced inline.
 */
export const entityColors = {
  note: { background: "rgba(239, 90, 138, 0.08)", foreground: "#171419" },
  task: { background: "#eff6ff", foreground: "#1e40af" },
  reminder: { background: "#fffbeb", foreground: "#78350f" },
  file: { background: "#f5f3ff", foreground: "#5b21b6" },
  event: { background: "#ecfdf5", foreground: "#065f46" },
} as const;

/** Category chip tints, matching the web's 100/700 category palette. */
export const categoryColors = {
  blue: { background: "#dbeafe", foreground: "#1d4ed8" },
  violet: { background: "#ede9fe", foreground: "#6d28d9" },
  emerald: { background: "#d1fae5", foreground: "#047857" },
  amber: { background: "#fef3c7", foreground: "#b45309" },
  rose: { background: "#ffe4e6", foreground: "#be123c" },
  cyan: { background: "#cffafe", foreground: "#0e7490" },
  orange: { background: "#ffedd5", foreground: "#c2410c" },
} as const;

/** Task priority flag tints from the web (blue, yellow, red). */
export const priorityColors = {
  low: "#2563eb",
  medium: "#f59e0b",
  high: "#dc2626",
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 9999,
} as const;

/** 4px base scale from DESIGN.md §9. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const shadows = {
  card: "0px 1px 2px rgba(23, 20, 25, 0.04), 0px 14px 36px -16px rgba(23, 20, 25, 0.06)",
  button:
    "0px 10px 24px -10px rgba(240, 102, 148, 0.28), 0px 6px 18px -8px rgba(140, 92, 255, 0.22)",
  raised: "0px 8px 24px -6px rgba(23, 20, 25, 0.18)",
} as const;

/** Native header and tab colors shared by every navigator. */
export const navigationColors = {
  header: colors.background,
  tint: colors.foreground,
} as const;
