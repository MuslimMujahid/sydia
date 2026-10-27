import type React from "react";
import { COLORS } from "../theme";
import { Avatar } from "./parts";

// Rina's laptop, open on the desk. The screen is whatever the caller passes;
// the lid, hinge and base are drawn with plain boxes so nothing is photographic.
export const Laptop = ({
  width,
  children,
}: {
  readonly width: number;
  readonly children: React.ReactNode;
}) => {
  const screenH = width * 0.6;
  return (
    <div style={{ width, position: "relative" }}>
      <div
        style={{
          width,
          height: screenH,
          borderRadius: 26,
          padding: 16,
          boxSizing: "border-box",
          background: "#1b181d",
          boxShadow:
            "rgba(23,20,25,0.22) 0 60px 110px -44px, inset 0 0 0 2px #322e35",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 14,
            overflow: "hidden",
            background: "#efeae2",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      </div>
      {/* hinge and the wedge of the base, in perspective */}
      <div
        style={{
          width: width * 1.1,
          height: 26,
          marginLeft: -width * 0.05,
          background: "linear-gradient(#2a262c, #17151a)",
          clipPath: "polygon(2% 0, 98% 0, 100% 100%, 0 100%)",
        }}
      />
      <div
        style={{
          width: width * 0.3,
          height: 9,
          margin: "0 auto",
          borderRadius: "0 0 10px 10px",
          background: "#141217",
          opacity: 0.55,
        }}
      />
    </div>
  );
};

// The client's own chat thread, the one Rina is staring at when the call lands.
// Deliberately not Sydia's thread: this message comes from Pak Budi.
export const ClientChat = ({
  message,
  time,
  shown,
}: {
  readonly message: string;
  readonly time: string;
  readonly shown: boolean;
}) => (
  <>
    <div
      style={{
        background: COLORS.surface,
        padding: "16px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderBottom: `1.5px solid ${COLORS.hairline}`,
      }}
    >
      <Avatar initials="PB" size={52} />
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.ink }}>
          Pak Budi
        </div>
        <div style={{ fontSize: 19, fontWeight: 500, color: COLORS.muted }}>
          klien
        </div>
      </div>
    </div>
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 12,
      }}
    >
      {shown ? (
        <div
          style={{
            alignSelf: "flex-start",
            maxWidth: "82%",
            background: COLORS.surface,
            borderRadius: 20,
            borderTopLeftRadius: 6,
            padding: "14px 18px 10px",
            fontSize: 25,
            lineHeight: 1.35,
            color: COLORS.ink,
            boxShadow: "rgba(23,20,25,0.1) 0 1px 2px",
          }}
        >
          {message}
          <div
            style={{
              fontSize: 17,
              color: COLORS.muted,
              textAlign: "right",
              marginTop: 4,
            }}
          >
            {time}
          </div>
        </div>
      ) : null}
    </div>
  </>
);

// Desk clock: the analog face reads the same time as the digits under it.
export const DeskClock = ({
  hour,
  minute,
  label,
}: {
  readonly hour: number;
  readonly minute: number;
  readonly label: string;
}) => (
  <div
    style={{
      width: 226,
      borderRadius: 32,
      background: COLORS.surface,
      border: `1.5px solid ${COLORS.border}`,
      boxShadow: "rgba(23,20,25,0.14) 0 30px 60px -28px",
      padding: "22px 20px 18px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
    }}
  >
    <svg width={132} height={132} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="55" fill="#faf7f4" />
      <circle
        cx="60"
        cy="60"
        r="55"
        fill="none"
        stroke="rgba(23,20,25,0.12)"
        strokeWidth={4}
      />
      {Array.from({ length: 12 }, (_, i) => (
        <circle
          key={i}
          cx={60 + 44 * Math.sin((i * Math.PI) / 6)}
          cy={60 - 44 * Math.cos((i * Math.PI) / 6)}
          r={i % 3 === 0 ? 3.6 : 2.2}
          fill="rgba(23,20,25,0.3)"
        />
      ))}
      <path
        d="M60 60 V32"
        stroke={COLORS.ink}
        strokeWidth={6}
        strokeLinecap="round"
        transform={`rotate(${(hour % 12) * 30 + minute * 0.5} 60 60)`}
      />
      <path
        d="M60 60 V22"
        stroke={COLORS.accent}
        strokeWidth={4.5}
        strokeLinecap="round"
        transform={`rotate(${minute * 6} 60 60)`}
      />
      <circle cx="60" cy="60" r="5" fill={COLORS.ink} />
    </svg>
    <div
      style={{
        fontSize: 40,
        fontWeight: 800,
        letterSpacing: "-0.03em",
        fontVariantNumeric: "tabular-nums",
        color: COLORS.ink,
      }}
    >
      {String(hour).padStart(2, "0")}.{String(minute).padStart(2, "0")}
    </div>
    <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.muted }}>
      {label}
    </div>
  </div>
);
