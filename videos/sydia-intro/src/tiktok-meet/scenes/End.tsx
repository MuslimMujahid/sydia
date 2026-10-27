import { AbsoluteFill } from "remotion";
import { Pop, Rise } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { SyncedWords } from "../../components/SyncedWords";
import { Logo } from "../../components/Ui";
import { COLORS, FONT, GRADIENT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { CamGlyph, MEET_GREEN } from "../parts";
import { PanickedRina } from "../rina";
import { Line, LINES } from "../voice";

const READY_AT = 0.1;
const SYDIA_AT = 1.3; // the payoff reads before the tagline starts

// Tail holds the CTA on screen for about 1.6 s after it rises, as in the other
// use-case videos.
export const END_SECONDS = SYDIA_AT + LINES["end-sydia"].duration + 1.8;

const headline = {
  fontWeight: 800,
  letterSpacing: "-0.045em",
  lineHeight: 1.04,
  justifyContent: "center",
} as const;

// The payoff: the call is on the calendar, the link is in hand, Rina is calm.
const Sorted = () => (
  <div style={{ position: "relative", width: SAFE_WIDTH, height: 372 }}>
    <div style={{ position: "absolute", left: 530, top: 66 }}>
      <PanickedRina width={230} relieved />
    </div>
    <Pop at={READY_AT} style={{ transformOrigin: "left top" }}>
      <div style={{ position: "absolute", left: 10, top: 104 }}>
        <div
          style={{
            width: 440,
            borderRadius: 32,
            background: COLORS.surface,
            border: `1.5px solid ${COLORS.border}`,
            boxShadow: "rgba(23,20,25,0.16) 0 36px 70px -30px",
            padding: "24px 28px",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.muted }}>
            14.00 · HARI INI
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginTop: 6,
            }}
          >
            Call dengan Pak Budi
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              marginTop: 16,
              padding: "12px 24px",
              borderRadius: 999,
              background: MEET_GREEN,
              color: "#fff",
              fontSize: 24,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <CamGlyph size={24} color="#fff" />
            Gabung Google Meet
          </div>
        </div>
      </div>
    </Pop>
    <div style={{ position: "absolute", left: 452, top: 24 }}>
      <Pop at={READY_AT + 0.25} style={{ transformOrigin: "left bottom" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "12px 26px",
            borderRadius: 999,
            background: COLORS.surface,
            border: `3px solid ${MEET_GREEN}`,
            color: MEET_GREEN,
            fontSize: 28,
            fontWeight: 800,
            whiteSpace: "nowrap",
            boxShadow: "rgba(26,138,76,0.3) 0 16px 34px -12px",
          }}
        >
          Siap tinggal gabung
        </div>
      </Pop>
    </div>
  </div>
);

export const End = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora
      intensity={1.3}
      blobs={[
        { color: COLORS.amber, x: 10, y: 14, size: 900, speed: 0.5 },
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
      <Sorted />
      <Pop at={READY_AT + 0.15} style={{ marginTop: 40 }}>
        <Logo size={112} />
      </Pop>
      {/* Two lines by hand: the problem, then who handles it. */}
      <SyncedWords
        scene="end-sydia"
        source={LINES}
        lead={SYDIA_AT}
        from={0}
        to={1}
        style={{ ...headline, fontSize: 92, marginTop: 34 }}
      />
      <SyncedWords
        scene="end-sydia"
        source={LINES}
        lead={SYDIA_AT}
        from={2}
        to={4}
        highlight={[2]}
        style={{ ...headline, fontSize: 76, marginTop: 8 }}
      />
      <Rise
        at={SYDIA_AT + LINES["end-sydia"].duration + 0.2}
        style={{ marginTop: 42 }}
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
