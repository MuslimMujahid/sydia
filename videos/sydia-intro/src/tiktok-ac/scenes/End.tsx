import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { SyncedWords } from "../../components/SyncedWords";
import { Logo } from "../../components/Ui";
import { COLORS, FONT, GRADIENT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { AcUnit, CoolStream } from "../ac";
import { SweatingRina } from "../room";
import { Line, LINES } from "../voice";

const COOL_AT = 0.1;
const SYDIA_AT = 1.5; // the room reads as cool before the tagline starts

// Tail holds the CTA on screen for about 1.6 s after it rises, as in the other
// use-case videos.
export const END_SECONDS = SYDIA_AT + LINES["end-sydia"].duration + 1.8;

// The sign-off is two lines: the name, then what Sydia is. Sized so each line
// stays on one row inside the 860px safe width.
const headline = {
  fontWeight: 800,
  letterSpacing: "-0.045em",
  lineHeight: 1.04,
  justifyContent: "center",
} as const;

// The payoff: Pak Joko came, the unit runs cold, Rina is comfortable again.
const CoolRoom = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <div style={{ position: "relative", width: SAFE_WIDTH, height: 372 }}>
      <Pop at={COOL_AT}>
        <div style={{ position: "absolute", left: 76, top: 0 }}>
          <AcUnit width={420} cool />
        </div>
      </Pop>
      {/* 360 wide draws 281 tall, so the stream stops inside this box. */}
      <div style={{ position: "absolute", left: 92, top: 90, opacity: 0.95 }}>
        <CoolStream width={360} phase={(t * 0.5) % 1} />
      </div>
      <div style={{ position: "absolute", left: 556, top: 70 }}>
        <SweatingRina width={212} fan={0} relieved />
      </div>
      <div style={{ position: "absolute", left: 540, top: 0 }}>
        <Pop at={COOL_AT + 0.25} style={{ transformOrigin: "left bottom" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 24px",
              borderRadius: 999,
              background: COLORS.surface,
              border: "3px solid #67b4f0",
              color: "#1f6ea8",
              fontSize: 28,
              fontWeight: 800,
              whiteSpace: "nowrap",
              boxShadow: "rgba(103,180,240,0.35) 0 16px 34px -12px",
            }}
          >
            Adem lagi
          </div>
        </Pop>
      </div>
    </div>
  );
};

export const End = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora
      intensity={1.3}
      blobs={[
        { color: "#67b4f0", x: 10, y: 14, size: 900, speed: 0.5 },
        { color: COLORS.violet, x: 94, y: 90, size: 900, speed: 0.42 },
        { color: COLORS.coral, x: 64, y: 104, size: 680, speed: 0.75 },
      ]}
    />
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        width: SAFE_WIDTH,
        top: SAFE.top,
        bottom: 1920 - SAFE.bottom,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <CoolRoom />
      {/* Clear of the cool-air stream above, which reaches the foot of CoolRoom. */}
      <Pop at={COOL_AT + 0.15} style={{ marginTop: 46 }}>
        <Logo size={112} />
      </Pop>
      {/* Two lines by hand: the name in the gradient, then what she is. */}
      <SyncedWords
        scene="end-sydia"
        source={LINES}
        lead={SYDIA_AT}
        from={0}
        to={0}
        highlight={[0]}
        style={{ ...headline, fontSize: 104, marginTop: 36 }}
      />
      <SyncedWords
        scene="end-sydia"
        source={LINES}
        lead={SYDIA_AT}
        from={1}
        to={2}
        style={{ ...headline, fontSize: 72, marginTop: 6 }}
      />
      <Rise
        at={SYDIA_AT + LINES["end-sydia"].duration + 0.2}
        style={{ marginTop: 44 }}
      >
        <div
          style={{
            backgroundImage: GRADIENT,
            color: "#fff",
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            padding: "28px 58px",
            borderRadius: 999,
            boxShadow:
              "rgba(240,102,148,0.35) 0 24px 50px -18px, rgba(140,92,255,0.28) 0 12px 30px -12px",
          }}
        >
          Coba gratis 7 hari
        </div>
      </Rise>
    </div>
    <Line id="end-sydia" at={SYDIA_AT} />
  </AbsoluteFill>
);
