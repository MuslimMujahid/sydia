import { AbsoluteFill } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise } from "../../components/Anim";
import { SyncedWords } from "../../components/SyncedWords";
import { GradientText, Logo } from "../../components/Ui";
import { COLORS, FONT, GRADIENT } from "../../theme";
import { Line, LINES, SAFE, SAFE_WIDTH } from "../parts";

const SYDIA_AT = 0.45;

export const END_SECONDS = SYDIA_AT + LINES["end-sydia"].duration + 2.2;

export const End = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.4} />
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
      <Pop at={0.1}>
        <Logo size={200} />
      </Pop>
      <SyncedWords
        scene="end-sydia"
        source={LINES}
        lead={SYDIA_AT}
        from={0}
        to={4}
        highlight={[4]}
        style={{
          fontSize: 116,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          justifyContent: "center",
          marginTop: 50,
        }}
      />
      <Rise
        at={SYDIA_AT + LINES["end-sydia"].duration + 0.1}
        style={{ marginTop: 40 }}
      >
        <div
          style={{
            fontSize: 54,
            fontWeight: 600,
            color: COLORS.muted,
            letterSpacing: "-0.02em",
          }}
        >
          Biar <GradientText>Sydia</GradientText> yang ingat.
        </div>
      </Rise>
      <Rise
        at={SYDIA_AT + LINES["end-sydia"].duration + 0.6}
        style={{ marginTop: 60 }}
      >
        <div
          style={{
            backgroundImage: GRADIENT,
            color: "#fff",
            fontSize: 52,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            padding: "32px 66px",
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
