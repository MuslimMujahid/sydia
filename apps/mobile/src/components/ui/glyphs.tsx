import type { ReactNode } from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { colors } from "@/lib/theme";

/**
 * Sydia glyphs, ported from apps/frontend/src/components/ui/glyphs.tsx: a
 * 20px-grid duotone set with a 1.5px outline and one accent shape in an
 * aurora stop. The accent rests at 50% and lights fully when `active`.
 */
export type GlyphHue = "amber" | "coral" | "violet";

export interface GlyphProps {
  size?: number;
  hue?: GlyphHue;
  active?: boolean;
  color?: string;
}

const HUES: Record<GlyphHue, string> = {
  amber: colors.amber,
  coral: colors.coral,
  violet: colors.violet,
};

function Glyph({
  size = 22,
  color = colors.foreground,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

function accent({ hue = "coral", active = false }: GlyphProps) {
  return {
    fill: HUES[hue],
    fillOpacity: active ? 1 : 0.5,
    stroke: "none",
  } as const;
}

const BUBBLE =
  "M6.75 3.25h6.5a3.5 3.5 0 0 1 3.5 3.5v4a3.5 3.5 0 0 1-3.5 3.5H9.6l-3.05 2.3a.6.6 0 0 1-.96-.48V14.1a3.5 3.5 0 0 1-2.34-3.3V6.75a3.5 3.5 0 0 1 3.5-3.5Z";

export function ChatSparkGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d={BUBBLE} />
      <Path
        {...accent(props)}
        d="M10 5.75c.25 1.75 1.25 2.75 3 3-1.75.25-2.75 1.25-3 3-.25-1.75-1.25-2.75-3-3 1.75-.25 2.75-1.25 3-3Z"
      />
    </Glyph>
  );
}

export function ChatDotsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d={BUBBLE} />
      <G {...accent(props)}>
        <Circle cx="7.25" cy="8.75" r="1" />
        <Circle cx="10" cy="8.75" r="1" />
        <Circle cx="12.75" cy="8.75" r="1" />
      </G>
    </Glyph>
  );
}

export function CalendarGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Rect x="3.25" y="4.25" width="13.5" height="12.5" rx="3.25" />
      <Path d="M3.25 8.25h13.5M7 2.75v3M13 2.75v3" />
      <Rect
        {...accent(props)}
        x="10.5"
        y="10.75"
        width="3.5"
        height="3.5"
        rx="1.2"
      />
    </Glyph>
  );
}

export function TaskListGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="m2.5 4.5 2 2 3.25-3.5M2.5 10.25l2 2 3.25-3.5" />
      <Path d="M10.5 4.75h6.75M10.5 10.5h6.75M10.5 16h6.75" />
      <Circle {...accent(props)} cx="5.1" cy="15.75" r="2.4" />
    </Glyph>
  );
}

export function NoteGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M15.75 8V6.5a3.25 3.25 0 0 0-3.25-3.25h-5A3.25 3.25 0 0 0 4.25 6.5v7a3.25 3.25 0 0 0 3.25 3.25h1.25" />
      <Path d="M7.5 7.25h5M7.5 10.25H10" />
      <Path
        {...accent(props)}
        d="M15.3 9.7a1.27 1.27 0 0 1 1.8 1.8l-4.9 4.9-2.45.65.65-2.45 4.9-4.9Z"
      />
    </Glyph>
  );
}

export function DocumentGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Rect x="4.25" y="2.75" width="11.5" height="14.5" rx="3.25" />
      <Path d="M7.5 6.5h5M7.5 13.5h3" />
      <Rect
        {...accent(props)}
        x="7"
        y="8.75"
        width="6"
        height="2.5"
        rx="1.25"
      />
    </Glyph>
  );
}

export function TableGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Rect x="3.25" y="3.75" width="13.5" height="12.5" rx="3.25" />
      <Path d="M3.25 8.75h13.5M3.25 12.5h13.5M8.25 8.75v7.5" />
      <Rect
        {...accent(props)}
        x="5.75"
        y="5.25"
        width="8.5"
        height="2"
        rx="1"
      />
    </Glyph>
  );
}

export function FolderGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M3.25 6.75a2.5 2.5 0 0 1 2.5-2.5h2.3a2 2 0 0 1 1.5.68l.9 1.07h3.8a2.5 2.5 0 0 1 2.5 2.5v5.25a2.5 2.5 0 0 1-2.5 2.5h-8.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <Rect
        {...accent(props)}
        x="6.25"
        y="11"
        width="5"
        height="2.5"
        rx="1.25"
      />
    </Glyph>
  );
}

export function MoreGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Circle cx="6.25" cy="6.25" r="2.25" />
      <Circle cx="13.75" cy="6.25" r="2.25" />
      <Circle cx="6.25" cy="13.75" r="2.25" />
      <Circle {...accent(props)} cx="13.75" cy="13.75" r="3" />
    </Glyph>
  );
}

export function BellGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M10 3.25A4.75 4.75 0 0 0 5.25 8v2.15c0 .7-.24 1.38-.69 1.92l-.72.87a1 1 0 0 0 .77 1.64h10.78a1 1 0 0 0 .77-1.64l-.72-.87a3 3 0 0 1-.69-1.92V8A4.75 4.75 0 0 0 10 3.25Z" />
      <Path {...accent(props)} d="M7.9 16.25a2.15 2.15 0 0 0 4.2 0Z" />
    </Glyph>
  );
}

export function ContactGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M3.75 16.75c.7-3 3.1-4.75 6.25-4.75s5.55 1.75 6.25 4.75" />
      <Circle {...accent(props)} cx="10" cy="7" r="3.25" />
    </Glyph>
  );
}

export function ShieldGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="m10 2.75 5.75 2.1V9.5c0 3.4-2.25 6.1-5.75 7.75-3.5-1.65-5.75-4.35-5.75-7.75V4.85L10 2.75Z" />
      <Circle {...accent(props)} cx="10" cy="9.5" r="2.25" />
    </Glyph>
  );
}

export function MemoryGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Circle cx="10" cy="10" r="6.75" />
      <Path
        {...accent(props)}
        d="M10 7c.25 1.75 1.25 2.75 3 3-1.75.25-2.75 1.25-3 3-.25-1.75-1.25-2.75-3-3 1.75-.25 2.75-1.25 3-3Z"
      />
    </Glyph>
  );
}

export function ReceiptGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M5.25 3.25h9.5v13.5l-2.375-1.5L10 16.75l-2.375-1.5-2.375 1.5Z" />
      <Path d="M8 11.25h4" />
      <Rect
        {...accent(props)}
        x="7.75"
        y="6.25"
        width="4.5"
        height="2.5"
        rx="1.25"
      />
    </Glyph>
  );
}

/** Settings: a slider pair with one knob lit; drawn in the same construction. */
export function SettingsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M3.25 6.5h4.5M12.25 6.5h4.5M3.25 13.5h7M14.75 13.5h2" />
      <Circle cx="10" cy="6.5" r="2.25" />
      <Circle {...accent(props)} cx="12.5" cy="13.5" r="2.5" />
    </Glyph>
  );
}
