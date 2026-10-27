import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS } from "../theme";
import { BigBubble } from "../tiktok/parts";

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

// An image message in the chat, with an optional caption underneath.
export const PhotoBubble = ({
  from,
  children,
  caption,
}: {
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
  readonly caption?: string;
}) => (
  <BigBubble from={from} style={{ padding: 7 }}>
    <div style={{ borderRadius: 20, overflow: "hidden" }}>{children}</div>
    {caption ? (
      <div style={{ padding: "10px 14px 4px", maxWidth: 380 }}>{caption}</div>
    ) : null}
  </BigBubble>
);

// The icon set has no clock, so the time row draws its own.
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

export type EventRow = {
  readonly at: number;
  readonly icon: "calendar" | "home" | "clock" | "bell";
  readonly label: string;
  readonly value: string;
};

// One row of the event card: a tinted glyph, a label and its value.
const Row = ({ at, icon, label, value }: EventRow) => {
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
          {icon === "clock" ? (
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
            {value}
          </div>
        </div>
      </div>
    </Rise>
  );
};

// The calendar event Sydia read off the photo, shown inside her reply bubble.
export const EventCard = ({
  at,
  title,
  rows,
}: {
  readonly at: number;
  readonly title: string;
  readonly rows: readonly EventRow[];
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Rise at={at} distance={24} blur={false} style={{ marginTop: 14 }}>
      <div
        style={{
          borderRadius: 26,
          background: "#fff8f4",
          border: "2px solid rgba(239,90,138,0.22)",
          padding: "24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            fontSize: 33,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {rows.map((row) => (
          <Row key={row.label} {...row} />
        ))}
      </div>
    </Rise>
  );
};
