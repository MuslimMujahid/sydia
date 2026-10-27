import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS } from "../theme";

// Pops a chat bubble in at `at` seconds, anchored to its side of the chat.
export const Shown = ({
  at,
  from,
  children,
}: {
  readonly at: number;
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  return (
    <Pop
      at={at}
      style={{
        alignSelf: from === "me" ? "flex-end" : "flex-start",
        transformOrigin: from === "me" ? "right bottom" : "left bottom",
      }}
    >
      {children}
    </Pop>
  );
};

// A water drop for the leak label; the shared icon set has none.
export const Drop = ({
  size = 28,
  color = "#5fa8e0",
}: {
  readonly size?: number;
  readonly color?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2.5c3.4 4.3 6.5 7.6 6.5 11.4A6.5 6.5 0 0 1 5.5 14C5.5 10.1 8.6 6.8 12 2.5z" />
  </svg>
);

// The icon set has no handset, so the call rows draw their own.
export const PhoneGlyph = ({
  size = 28,
  color = COLORS.accent,
}: {
  readonly size?: number;
  readonly color?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M6.6 3.2c.8-.3 1.7.1 2 .9l1.1 2.6c.3.7.1 1.5-.5 2l-1 .8a11 11 0 0 0 4.3 4.3l.8-1c.5-.6 1.3-.8 2-.5l2.6 1.1c.8.3 1.2 1.2.9 2l-.6 1.7a2.4 2.4 0 0 1-2.6 1.6C10.4 18.9 5.1 13.6 4 7.4A2.4 2.4 0 0 1 5.6 4.8z" />
  </svg>
);

// A contact's initials as the avatar, so the card needs no photo.
export const Avatar = ({
  initials,
  size = 92,
}: {
  readonly initials: string;
  readonly size?: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: "linear-gradient(140deg, #ff8a4c 0%, #f06694 100%)",
      color: "#fff",
      fontSize: size * 0.38,
      fontWeight: 800,
      letterSpacing: "-0.02em",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      boxShadow: "rgba(240,102,148,0.35) 0 14px 30px -12px",
    }}
  >
    {initials}
  </div>
);

// The alias Rina searched by, shown as a saved label on the contact so it is
// clear the match came from "Tukang AC", not from the name.
export const AliasChip = ({
  label,
  lit = false,
}: {
  readonly label: string;
  readonly lit?: boolean;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "9px 20px 9px 14px",
      borderRadius: 999,
      background: lit ? "#ffe9d9" : "#fff2ec",
      border: `2px solid ${lit ? COLORS.amber : "rgba(239,90,138,0.22)"}`,
      color: lit ? "#c2561f" : COLORS.accent,
      fontSize: 25,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
    <Icon name="sparkle" size={24} color={lit ? "#c2561f" : COLORS.accent} />
    {label}
  </div>
);

// One saved field on the contact: a tinted glyph, the label, the value.
export const ContactRow = ({
  at,
  icon,
  label,
  children,
}: {
  readonly at: number;
  readonly icon: "phone" | "calendar" | "file";
  readonly label: string;
  readonly children: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Rise at={at} distance={16} blur={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: "#fff2ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon === "phone" ? (
            <PhoneGlyph size={28} />
          ) : (
            <Icon name={icon} size={28} color={COLORS.accent} />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 600, color: COLORS.muted }}>
            {label}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.25 }}>
            {children}
          </div>
        </div>
      </div>
    </Rise>
  );
};
