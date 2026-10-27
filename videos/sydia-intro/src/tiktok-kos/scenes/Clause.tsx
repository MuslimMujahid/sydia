import type React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { Icon } from "../../components/Ui";
import { COLORS, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH, Sfx } from "../../tiktok/parts";
import { HighlightedClause } from "../contract";
import { SourceChip } from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const PAGE_AT = 0.15;
const VO_AT = 0.3;
// The marker sweeps as Sydia names the clause, then each condition lands on
// the words that state it: "boleh", then "asal izin pemilik kos".
const MARK_AT = spokenAt("reply-sydia", VO_AT, 1) - 0.1;
const YES_AT = spokenAt("reply-sydia", VO_AT, 4) - 0.1;
const IZIN_AT = spokenAt("reply-sydia", VO_AT, 6) - 0.15;
const CHIP_AT = MARK_AT + 0.6;

export const CLAUSE_SECONDS = VO_AT + LINES["reply-sydia"].duration + 0.85;

const PAGE_W = 600;
const TOP = 566;

// A verdict badge pinned to the page, reading the clause in plain words.
const Badge = ({
  at,
  tone,
  icon,
  children,
  style,
}: {
  readonly at: number;
  readonly tone: "yes" | "note";
  readonly icon: "check" | "users";
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  const yes = tone === "yes";
  return (
    <div style={{ position: "absolute", ...style }}>
      <Pop at={at}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 28px",
            borderRadius: 999,
            background: yes ? "#1b8347" : COLORS.surface,
            color: yes ? "#fff" : COLORS.ink,
            border: yes ? undefined : `3px solid ${COLORS.amber}`,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            boxShadow: yes
              ? "rgba(27,131,71,0.4) 0 18px 36px -14px"
              : "rgba(255,138,76,0.35) 0 18px 36px -14px",
          }}
        >
          <Icon name={icon} size={32} color={yes ? "#fff" : COLORS.amber} />
          {children}
        </div>
      </Pop>
    </div>
  );
};

export const Clause = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.25} />
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        top: TOP,
        width: SAFE_WIDTH,
        height: SAFE.bottom - TOP,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* The page sits slightly off-centre so the badges can break its edge. */}
      <div style={{ position: "relative", marginLeft: -56 }}>
        <HighlightedClause at={PAGE_AT} markAt={MARK_AT} width={PAGE_W} />
        <Badge
          at={YES_AT}
          tone="yes"
          icon="check"
          style={{ right: -118, top: 236 }}
        >
          Boleh
        </Badge>
        <Badge
          at={IZIN_AT}
          tone="note"
          icon="users"
          style={{ right: -148, top: 350 }}
        >
          Izin pemilik dulu
        </Badge>
      </div>
      <Rise at={CHIP_AT} distance={16} blur={false} style={{ marginTop: 26 }}>
        <SourceChip label="Kontrak Kos 2026.pdf · hal. 3" />
      </Rise>
    </div>

    <Caption id="reply-sydia" at={VO_AT} speaker="sydia" />

    <Sfx kind="received" at={PAGE_AT} />
    <Line id="reply-sydia" at={VO_AT} />
  </AbsoluteFill>
);
