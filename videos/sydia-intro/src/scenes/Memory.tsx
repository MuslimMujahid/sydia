import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Rise, Typewriter } from "../components/Anim";
import { SyncedWords } from "../components/SyncedWords";
import { Card, GradientText, Icon, Logo } from "../components/Ui";
import {
  CARD_SHADOW,
  COLORS,
  EASE_OUT,
  FONT,
  GRADIENT,
  wordAt,
} from "../theme";

export const Memory = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const askAt = wordAt("memory", 2);
  const answerAt = wordAt("memory", 4);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          scale: interpolate(frame, [0, 7.4 * fps], [1, 1.05]),
          translate: interpolate(
            frame,
            [answerAt * fps, (answerAt + 0.8) * fps],
            ["0px 120px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_OUT,
            },
          ),
        }}
      >
        <SyncedWords
          scene="memory"
          from={0}
          to={3}
          highlight={[2, 3]}
          style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.04em" }}
        />

        <Rise at={0.2} distance={60}>
          <div
            style={{
              width: 1320,
              height: 150,
              borderRadius: 75,
              background: COLORS.surface,
              boxShadow: CARD_SHADOW,
              border: `1.5px solid ${COLORS.border}`,
              display: "flex",
              alignItems: "center",
              gap: 30,
              padding: "0 50px",
            }}
          >
            <Icon name="search" size={52} color={COLORS.muted} />
            <div
              style={{
                fontSize: 58,
                fontWeight: 500,
                letterSpacing: "-0.02em",
              }}
            >
              <Typewriter
                text="Ukuran sepatu Dina berapa, ya?"
                at={askAt}
                cps={20}
              />
            </div>
          </div>
        </Rise>

        <Rise at={answerAt} distance={60} style={{ height: 250 }}>
          <div
            style={{ padding: 3, borderRadius: 40, backgroundImage: GRADIENT }}
          >
            <Card
              style={{
                width: 1314,
                padding: "40px 48px",
                display: "flex",
                gap: 30,
                borderRadius: 37,
              }}
            >
              <Logo size={72} />
              <div>
                <div
                  style={{
                    fontSize: 50,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.25,
                  }}
                >
                  Ukuran <GradientText>38</GradientText>. Anda mencatatnya waktu
                  cari kado ulang tahun Dina.
                </div>
                <div
                  style={{ fontSize: 30, color: COLORS.muted, marginTop: 16 }}
                >
                  Dari chat, 12 Agustus
                </div>
              </div>
            </Card>
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
