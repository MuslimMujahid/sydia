import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../components/Anim";
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

// Where the answer came from: the saved file and the page it was read on.
export const SourceChip = ({ label }: { readonly label: string }) => (
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

// A saved PDF as it sits in the chat: red file tile, name and size.
export const DocBubbleBody = ({
  name,
  meta,
}: {
  readonly name: string;
  readonly meta: string;
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 20, width: 520 }}>
    <div
      style={{
        width: 76,
        height: 76,
        borderRadius: 20,
        background: "#fdeceb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name="file" size={40} color="#d6453e" />
    </div>
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 31,
          fontWeight: 700,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 24, color: COLORS.muted, marginTop: 4 }}>
        {meta}
      </div>
    </div>
  </div>
);

// The draft message Sydia wrote, as a quoted note with a Salin button.
// Sydia never sends to third parties, so copying is the only action offered.
export const DraftNote = ({
  text,
  copied,
  press = 0,
}: {
  readonly text: string;
  readonly copied: boolean;
  readonly press?: number;
}) => (
  <div
    style={{
      width: 560,
      borderRadius: 26,
      background: "#fff8f4",
      border: "2px solid rgba(239,90,138,0.22)",
      padding: "24px 26px",
      display: "flex",
      flexDirection: "column",
      gap: 20,
    }}
  >
    <div style={{ display: "flex", gap: 18 }}>
      <div
        style={{
          width: 5,
          borderRadius: 3,
          background: COLORS.accent,
          opacity: 0.5,
          flexShrink: 0,
        }}
      />
      <div style={{ fontSize: 30, lineHeight: 1.42, fontWeight: 500 }}>
        {text}
      </div>
    </div>
    <div
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 28px",
        borderRadius: 999,
        background: copied ? "#eaf7ee" : COLORS.surface,
        border: `2px solid ${copied ? "rgba(31,168,85,0.35)" : "rgba(239,90,138,0.3)"}`,
        color: copied ? "#1b8347" : COLORS.accent,
        fontSize: 28,
        fontWeight: 700,
        scale: String(1 - 0.05 * press),
        boxShadow: copied
          ? undefined
          : "rgba(239,90,138,0.18) 0 10px 22px -10px",
      }}
    >
      <Icon
        name={copied ? "check" : "list"}
        size={28}
        color={copied ? "#1b8347" : COLORS.accent}
      />
      {copied ? "Tersalin" : "Salin"}
    </div>
  </div>
);
