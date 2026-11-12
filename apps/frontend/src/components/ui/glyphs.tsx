import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Sydia glyphs: an authored duotone icon set on a 20px grid. Each glyph is a
 * 1.5px rounded outline plus one filled accent shape (`.glyph-accent`). The
 * accent rests as a faint ink tint and takes its aurora hue, with a small pop,
 * when the nearest `.glyph-host` is hovered, focused, or active.
 * Styles live under "Sydia glyphs" in globals.css.
 */
type GlyphHue = "amber" | "coral" | "violet";

type GlyphProps = {
  className?: string;
  /** Aurora stop the accent takes when its host is active. */
  hue?: GlyphHue;
};

const HUE_CLASS: Record<GlyphHue, string> = {
  amber: "glyph-amber",
  coral: "glyph-coral",
  violet: "glyph-violet",
};

function Glyph({
  className,
  hue = "coral",
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("glyph", HUE_CLASS[hue], className)}
    >
      {children}
    </svg>
  );
}

const BUBBLE =
  "M6.75 3.25h6.5a3.5 3.5 0 0 1 3.5 3.5v4a3.5 3.5 0 0 1-3.5 3.5H9.6l-3.05 2.3a.6.6 0 0 1-.96-.48V14.1a3.5 3.5 0 0 1-2.34-3.3V6.75a3.5 3.5 0 0 1 3.5-3.5Z";

/** New chat: a speech bubble holding a spark. */
export function ChatSparkGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={BUBBLE} />
      <path
        className="glyph-accent"
        d="M10 5.75c.25 1.75 1.25 2.75 3 3-1.75.25-2.75 1.25-3 3-.25-1.75-1.25-2.75-3-3 1.75-.25 2.75-1.25 3-3Z"
      />
    </Glyph>
  );
}

/** Chat previews: a speech bubble with three typing dots. */
export function ChatDotsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={BUBBLE} />
      <g className="glyph-accent">
        <circle cx="7.25" cy="8.75" r="1" />
        <circle cx="10" cy="8.75" r="1" />
        <circle cx="12.75" cy="8.75" r="1" />
      </g>
    </Glyph>
  );
}

/** Calendar: a ringed sheet with today marked. */
export function CalendarGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3.25" y="4.25" width="13.5" height="12.5" rx="3.25" />
      <path d="M3.25 8.25h13.5M7 2.75v3M13 2.75v3" />
      <rect
        className="glyph-accent"
        x="10.5"
        y="10.75"
        width="3.5"
        height="3.5"
        rx="1.2"
      />
    </Glyph>
  );
}

/** Notes: a page with a pen resting on its corner. */
export function NoteGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M15.75 8V6.5a3.25 3.25 0 0 0-3.25-3.25h-5A3.25 3.25 0 0 0 4.25 6.5v7a3.25 3.25 0 0 0 3.25 3.25h1.25" />
      <path d="M7.5 7.25h5M7.5 10.25H10" />
      <path
        className="glyph-accent"
        d="M15.3 9.7a1.27 1.27 0 0 1 1.8 1.8l-4.9 4.9-2.45.65.65-2.45 4.9-4.9Z"
      />
    </Glyph>
  );
}

/** Files: a folder with a label. */
export function FolderGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.25 6.75a2.5 2.5 0 0 1 2.5-2.5h2.3a2 2 0 0 1 1.5.68l.9 1.07h3.8a2.5 2.5 0 0 1 2.5 2.5v5.25a2.5 2.5 0 0 1-2.5 2.5h-8.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <rect
        className="glyph-accent"
        x="6.25"
        y="11"
        width="5"
        height="2.5"
        rx="1.25"
      />
    </Glyph>
  );
}

/** More: four dots, one of them lit. */
export function MoreGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="6.25" cy="6.25" r="2.25" />
      <circle cx="13.75" cy="6.25" r="2.25" />
      <circle cx="6.25" cy="13.75" r="2.25" />
      <circle className="glyph-accent" cx="13.75" cy="13.75" r="3" />
    </Glyph>
  );
}

/** Reminders: a bell whose clapper is the accent. */
export function BellGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M10 3.25A4.75 4.75 0 0 0 5.25 8v2.15c0 .7-.24 1.38-.69 1.92l-.72.87a1 1 0 0 0 .77 1.64h10.78a1 1 0 0 0 .77-1.64l-.72-.87a3 3 0 0 1-.69-1.92V8A4.75 4.75 0 0 0 10 3.25Z" />
      <path className="glyph-accent" d="M7.9 16.25a2.15 2.15 0 0 0 4.2 0Z" />
    </Glyph>
  );
}

/** Contacts: a person whose head is the accent. */
export function ContactGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.75 16.75c.7-3 3.1-4.75 6.25-4.75s5.55 1.75 6.25 4.75" />
      <circle className="glyph-accent" cx="10" cy="7" r="3.25" />
    </Glyph>
  );
}

/** Secrets: a shield with a sealed core. */
export function ShieldGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m10 2.75 5.75 2.1V9.5c0 3.4-2.25 6.1-5.75 7.75-3.5-1.65-5.75-4.35-5.75-7.75V4.85L10 2.75Z" />
      <circle className="glyph-accent" cx="10" cy="9.5" r="2.25" />
    </Glyph>
  );
}

/** Memory: a spark held in orbit. */
export function MemoryGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="10" r="6.75" />
      <path
        className="glyph-accent"
        d="M10 7c.25 1.75 1.25 2.75 3 3-1.75.25-2.75 1.25-3 3-.25-1.75-1.25-2.75-3-3 1.75-.25 2.75-1.25 3-3Z"
      />
    </Glyph>
  );
}

/** Expenses: a receipt with its total marked. */
export function ReceiptGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5.25 3.25h9.5v13.5l-2.375-1.5L10 16.75l-2.375-1.5-2.375 1.5Z" />
      <path d="M8 11.25h4" />
      <rect
        className="glyph-accent"
        x="7.75"
        y="6.25"
        width="4.5"
        height="2.5"
        rx="1.25"
      />
    </Glyph>
  );
}

export type { GlyphHue, GlyphProps };
