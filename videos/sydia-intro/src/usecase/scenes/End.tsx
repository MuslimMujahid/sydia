import { AbsoluteFill } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise } from "../../components/Anim";
import { GradientText, Logo } from "../../components/Ui";
import { COLORS, FONT, GRADIENT } from "../../theme";
import { Line, LINES } from "../parts";

const SYDIA_AT = 0.6;

export const END_SECONDS = 6.6;

export const End = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.4} />
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 30,
      }}
    >
      <Pop at={0.15}>
        <Logo size={170} />
      </Pop>
      <Rise at={SYDIA_AT - 0.05} style={{ marginTop: 40 }}>
        <div
          style={{ fontSize: 124, fontWeight: 700, letterSpacing: "-0.045em" }}
        >
          Biar Sydia yang <GradientText>ingat.</GradientText>
        </div>
      </Rise>
      <Rise
        at={SYDIA_AT + LINES["end-sydia"].duration + 0.1}
        style={{ marginTop: 20 }}
      >
        <div
          style={{
            fontSize: 46,
            fontWeight: 500,
            color: COLORS.muted,
            letterSpacing: "-0.015em",
          }}
        >
          Asisten pribadi di WhatsApp, siap membantu kapan saja.
        </div>
      </Rise>
      <Rise
        at={SYDIA_AT + LINES["end-sydia"].duration + 0.8}
        style={{ marginTop: 56 }}
      >
        <div
          style={{
            backgroundImage: GRADIENT,
            color: "#fff",
            fontSize: 46,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            padding: "28px 60px",
            borderRadius: 999,
            boxShadow:
              "rgba(240,102,148,0.35) 0 24px 50px -18px, rgba(140,92,255,0.28) 0 12px 30px -12px",
          }}
        >
          Coba gratis 7 hari
        </div>
      </Rise>
    </AbsoluteFill>
    <Line id="end-sydia" at={SYDIA_AT} />
  </AbsoluteFill>
);
