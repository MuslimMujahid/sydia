import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS } from "../theme";

// The people and addresses in this video are invented; the domain is fake.
export const BUDI = {
  name: "Pak Budi",
  initials: "PB",
  email: "budi@contoh.co",
  role: "Klien · PT Contoh",
} as const;

export const MEET_LINK = "meet.google.com/abc-defg-hij";
// Meet's own palette, approximated: no Google mark is drawn anywhere.
export const MEET_GREEN = "#1a8a4c";
export const MEET_BLUE = "#2f6fd0";

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

// The icon set has no clock, so the time rows draw their own.
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

// A plain video camera, not Google's mark: a rounded body with a lens cone.
export const CamGlyph = ({
  size = 32,
  color = MEET_GREEN,
}: {
  readonly size?: number;
  readonly color?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <rect x="2.5" y="6" width="13" height="12" rx="3.2" />
    <path d="M16.8 11.1l4.1-2.9c.4-.3 1 0 1 .5v6.6c0 .5-.6.8-1 .5l-4.1-2.9z" />
  </svg>
);

// An envelope for the invitation rows.
export const MailGlyph = ({
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
    strokeLinejoin="round"
  >
    <rect x="2.5" y="5" width="19" height="14" rx="3" />
    <path d="M3.5 7.5l8.5 6 8.5-6" />
  </svg>
);

// A spinning arc, for work Sydia has started but not finished.
export const Spinner = ({
  size = 30,
  color = MEET_BLUE,
}: {
  readonly size?: number;
  readonly color?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ rotate: `${((frame / fps) * 300) % 360}deg` }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth={2.6}
        opacity={0.2}
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </svg>
  );
};

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

// Shows that the email came from a contact Rina had already saved, not from
// anything Rina typed in this conversation.
export const ContactChip = ({ at }: { readonly at: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Pop at={at} style={{ transformOrigin: "left center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 22px 10px 10px",
          borderRadius: 999,
          background: "#fff2ec",
          border: "2px solid rgba(239,90,138,0.26)",
          whiteSpace: "nowrap",
        }}
      >
        <Avatar initials={BUDI.initials} size={46} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.ink }}>
            {BUDI.name}
          </div>
          <div style={{ fontSize: 21, fontWeight: 600, color: COLORS.accent }}>
            {BUDI.email}
          </div>
        </div>
      </div>
    </Pop>
  );
};

// One line of Sydia's receipt: done rows carry a check, pending rows a spinner.
export const StatusRow = ({
  at,
  state,
  label,
  tint,
}: {
  readonly at: number;
  readonly state: "done" | "pending";
  readonly label: React.ReactNode;
  readonly tint?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  const color = tint ?? (state === "done" ? MEET_GREEN : MEET_BLUE);
  return (
    <Rise at={at} distance={14} blur={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            background: state === "done" ? "#e8f5ec" : "#eef3fc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {state === "done" ? (
            <Icon name="check" size={26} color={color} />
          ) : (
            <Spinner size={26} color={color} />
          )}
        </div>
        <div style={{ fontSize: 27, fontWeight: 700, color: COLORS.ink }}>
          {label}
        </div>
      </div>
    </Rise>
  );
};

// A "later that day" marker inside the chat, so the follow-up reads as a
// second message and not as part of the first reply.
export const TimeGap = ({
  at,
  children,
}: {
  readonly at: number;
  readonly children: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Rise at={at} distance={10} blur={false} style={{ alignSelf: "center" }}>
      <div
        style={{
          background: "rgba(255,255,255,0.92)",
          borderRadius: 14,
          padding: "7px 20px",
          fontSize: 23,
          fontWeight: 600,
          color: COLORS.muted,
        }}
      >
        {children}
      </div>
    </Rise>
  );
};
