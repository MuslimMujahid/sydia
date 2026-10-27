import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS, GRADIENT } from "../theme";
import { Clock, ContactChip, StatusRow } from "./parts";

// One detail line of the event: a tinted glyph, the label, the value.
const Row = ({
  at,
  icon,
  label,
  value,
}: {
  readonly at: number;
  readonly icon: "calendar" | "clock";
  readonly label: string;
  readonly value: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Rise at={at} distance={14} blur={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 15,
            background: "#fff2ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon === "clock" ? (
            <Clock size={27} />
          ) : (
            <Icon name="calendar" size={27} color={COLORS.accent} />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.muted }}>
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25 }}>
            {value}
          </div>
        </div>
      </div>
    </Rise>
  );
};

// The receipt Sydia sends back: the event she created in Rina's calendar, the
// contact the email address came from, and what has and has not finished yet.
export const EventReceipt = ({
  at,
  whenAt,
  contactAt,
  sentAt,
  pendingAt,
  children,
}: {
  readonly at: number;
  readonly whenAt: number;
  readonly contactAt: number;
  readonly sentAt: number;
  readonly pendingAt: number;
  // An optional extra row, e.g. the ready link in the follow-up scene.
  readonly children?: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Rise at={at} distance={22} blur={false} style={{ marginTop: 14 }}>
      <div
        style={{
          width: 576,
          borderRadius: 26,
          background: "#fff8f4",
          border: "2px solid rgba(239,90,138,0.22)",
          padding: "24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Pop at={at + 0.1}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 17,
                backgroundImage: GRADIENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="calendar" size={29} color="#fff" />
            </div>
          </Pop>
          <div
            style={{
              fontSize: 31,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            Call dengan Pak Budi
          </div>
        </div>

        <Row
          at={whenAt}
          icon="clock"
          label="Jadwal"
          value="Selasa, 27 Okt · 14.00–14.30"
        />

        {/* Where the email came from: a contact Rina saved, not a guess. */}
        <div style={{ minHeight: 66 }}>
          <ContactChip at={contactAt} />
        </div>

        <div
          style={{
            height: 2,
            background: "rgba(23,20,25,0.07)",
            borderRadius: 1,
          }}
        />

        {/* Fixed height: rows land one by one without resizing the card. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minHeight: 108,
          }}
        >
          <StatusRow at={sentAt} state="done" label="Undangan terkirim" />
          {children ?? (
            <StatusRow
              at={pendingAt}
              state="pending"
              label="Link Google Meet sedang dibuat…"
            />
          )}
        </div>
      </div>
    </Rise>
  );
};
