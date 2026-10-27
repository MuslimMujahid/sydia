import type React from "react";
import { Img, staticFile } from "remotion";
import { CARD_SHADOW, COLORS, GRADIENT } from "../theme";

export const GradientText = ({
  children,
  style,
}: {
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
  <span
    style={{
      backgroundImage: GRADIENT,
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      color: "transparent",
      paddingBottom: "0.08em",
      ...style,
    }}
  >
    {children}
  </span>
);

export const Logo = ({ size }: { readonly size: number }) => (
  <Img src={staticFile("logo.svg")} style={{ width: size, height: size }} />
);

export const Card = ({
  children,
  style,
}: {
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      background: COLORS.surface,
      border: `1.5px solid ${COLORS.border}`,
      borderRadius: 28,
      boxShadow: CARD_SHADOW,
      ...style,
    }}
  >
    {children}
  </div>
);

// Round icon tile used in cards: a soft tinted square with a glyph inside.
export const IconTile = ({
  children,
  tint,
  size = 64,
}: {
  readonly children: React.ReactNode;
  readonly tint: string;
  readonly size?: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.3,
      background: tint,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

// Minimal line icons, drawn inline so the video has no icon dependency.
const stroke = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const Icon = ({
  name,
  size = 32,
  color = COLORS.ink,
}: {
  readonly name:
    | "check"
    | "bell"
    | "calendar"
    | "mic"
    | "image"
    | "file"
    | "sparkle"
    | "search"
    | "brain"
    | "home"
    | "chat"
    | "users"
    | "send"
    | "play"
    | "sun"
    | "list";
  readonly size?: number;
  readonly color?: string;
}) => {
  const paths: Record<typeof name, React.ReactNode> = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    bell: (
      <>
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
        <path d="M10 20.5a2 2 0 0 0 4 0" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </>
    ),
    image: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <circle cx="9" cy="10" r="1.8" />
        <path d="M20.5 16l-5-5-9 8.5" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H7a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V8.5z" />
        <path d="M14 3v5.5h5.5M8.5 13h7M8.5 16.5h5" />
      </>
    ),
    sparkle: (
      <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" />
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </>
    ),
    brain: (
      <>
        <path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.5A3 3 0 0 0 7 18a3 3 0 0 0 5 1.5V6a3 3 0 0 0-3-1.5z" />
        <path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.5A3 3 0 0 1 17 18a3 3 0 0 1-5 1.5" />
      </>
    ),
    home: (
      <path d="M4 11l8-6.5 8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
    ),
    chat: (
      <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" />
    ),
    users: (
      <>
        <circle cx="9" cy="8.5" r="3.5" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3.5 3.5 0 0 1 0 6.5M21 20a6 6 0 0 0-3.5-5.5" />
      </>
    ),
    send: <path d="M4 12l16-7.5-6 16-2.5-6.5z" />,
    play: <path d="M8 5.5v13l10.5-6.5z" fill={color} />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </>
    ),
    list: (
      <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke={color}
      {...stroke}
    >
      {paths[name]}
    </svg>
  );
};
