import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS } from "../theme";

// A chat message that pops in at `at` seconds and takes no space before then.
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

// A row inside Sydia's message, revealed as the voice reaches it.
export const Row = ({
  icon,
  title,
  note,
  at,
  first,
  urgent,
}: {
  readonly icon: "bell" | "check" | "calendar";
  readonly title: string;
  readonly note: string;
  readonly at: number;
  readonly first?: boolean;
  readonly urgent?: boolean;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  return (
    <Rise at={at} distance={18} blur={false}>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          padding: "14px 0",
          borderTop: first ? "none" : `1.5px solid ${COLORS.hairline}`,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: urgent ? "#ffe3ec" : "#f1eef4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon
            name={icon}
            size={32}
            color={urgent ? COLORS.accent : COLORS.muted}
          />
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: urgent ? COLORS.accent : COLORS.muted,
            }}
          >
            {note}
          </div>
        </div>
      </div>
    </Rise>
  );
};
