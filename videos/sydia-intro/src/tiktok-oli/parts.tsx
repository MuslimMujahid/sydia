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

// The icon set has no gauge, so the kilometre rows draw their own.
export const Gauge = ({
  size = 28,
  color = COLORS.accent,
}: {
  readonly size?: number;
  readonly color?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
  >
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="M12 13.5l4-3.5" />
    <circle cx="12" cy="17" r="1.4" fill={color} stroke="none" />
  </svg>
);

// The icon set has no clock either, so the elapsed-time row draws its own.
export const Clock = ({
  size = 28,
  color = COLORS.accent,
}: {
  readonly size?: number;
  readonly color?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.5 2.5" />
  </svg>
);

// Where an answer came from: a note Rina wrote on that day.
export const NoteChip = ({ label }: { readonly label: string }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 20px 10px 14px",
      borderRadius: 999,
      background: "#fff2ec",
      color: COLORS.accent,
      fontSize: 25,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
    <Icon name="file" size={26} color={COLORS.accent} />
    {label}
  </div>
);

// The reading Rina wrote down, drawn as a dashboard odometer.
export const Odometer = ({
  value,
  scale = 1,
}: {
  readonly value: string;
  readonly scale?: number;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10 * scale,
      padding: `${8 * scale}px ${12 * scale}px`,
      borderRadius: 14 * scale,
      background: "#26222a",
      boxShadow: `inset 0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.5)`,
    }}
  >
    {value.split("").map((char, i) =>
      char === "." ? (
        <div
          key={i}
          style={{
            width: 4 * scale,
            height: 4 * scale,
            borderRadius: "50%",
            background: "#ffb37a",
            alignSelf: "flex-end",
            marginBottom: 6 * scale,
          }}
        />
      ) : (
        <div
          key={i}
          style={{
            width: 26 * scale,
            height: 38 * scale,
            borderRadius: 6 * scale,
            background: "#15121a",
            color: "#ffc48c",
            fontSize: 30 * scale,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {char}
        </div>
      ),
    )}
    <div
      style={{
        fontSize: 22 * scale,
        fontWeight: 700,
        color: "#8f8a93",
        letterSpacing: "0.08em",
        marginLeft: 2 * scale,
      }}
    >
      KM
    </div>
  </div>
);

// One fact Sydia read back: a tinted glyph, a label and its value.
export const FactRow = ({
  at,
  icon,
  label,
  children,
}: {
  readonly at: number;
  readonly icon: "calendar" | "gauge" | "clock" | "bell" | "sun";
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
            width: 50,
            height: 50,
            borderRadius: 16,
            background: "#fff2ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon === "gauge" ? (
            <Gauge size={28} />
          ) : icon === "clock" ? (
            <Clock size={28} />
          ) : (
            <Icon name={icon} size={28} color={COLORS.accent} />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 600, color: COLORS.muted }}>
            {label}
          </div>
          <div style={{ fontSize: 29, fontWeight: 700, lineHeight: 1.25 }}>
            {children}
          </div>
        </div>
      </div>
    </Rise>
  );
};
