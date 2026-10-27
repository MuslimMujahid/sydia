import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop } from "../components/Anim";
import { SyncedWords } from "../components/SyncedWords";
import { GradientText, Logo } from "../components/Ui";
import {
  CARD_SHADOW,
  COLORS,
  EASE_IN_OUT,
  EASE_OUT,
  FONT,
  VO_LEAD,
  wordAt,
} from "../theme";

export const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const liftAt = wordAt("intro", 2) * fps;
  const nameAt = wordAt("intro", 1);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 36,
            fontSize: 160,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            translate: interpolate(
              frame,
              [liftAt - 4, liftAt + 0.7 * fps],
              ["0px 0px", "0px -150px"],
              {
                ...clamp,
                easing: EASE_IN_OUT,
              },
            ),
            scale: interpolate(
              frame,
              [liftAt - 4, liftAt + 0.7 * fps],
              [1, 0.82],
              {
                ...clamp,
                easing: EASE_IN_OUT,
              },
            ),
          }}
        >
          <span
            style={{
              opacity: interpolate(
                frame,
                [VO_LEAD * fps - 6, VO_LEAD * fps + 8],
                [0, 1],
                clamp,
              ),
            }}
          >
            Kenalkan
          </span>
          <Pop at={nameAt - 0.12}>
            <div
              style={{
                width: 190,
                height: 190,
                borderRadius: 60,
                background: COLORS.surface,
                boxShadow: CARD_SHADOW,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                rotate: `${interpolate(
                  frame,
                  [(nameAt - 0.12) * fps, (nameAt + 0.6) * fps],
                  [-14, 0],
                  {
                    ...clamp,
                    easing: EASE_OUT,
                  },
                )}deg`,
              }}
            >
              <Logo size={136} />
            </div>
          </Pop>
          <span
            style={{
              opacity: interpolate(
                frame,
                [nameAt * fps, nameAt * fps + 8],
                [0, 1],
                clamp,
              ),
              translate: interpolate(
                frame,
                [nameAt * fps, nameAt * fps + 0.5 * fps],
                ["-30px 0px", "0px 0px"],
                {
                  ...clamp,
                  easing: EASE_OUT,
                },
              ),
            }}
          >
            <GradientText>Sydia</GradientText>
          </span>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 260,
        }}
      >
        <SyncedWords
          scene="intro"
          from={2}
          to={6}
          highlight={[6]}
          style={{
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            justifyContent: "center",
          }}
        />
        <SyncedWords
          scene="intro"
          from={7}
          to={10}
          highlight={[10]}
          style={{
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            justifyContent: "center",
            color: COLORS.muted,
            marginTop: 10,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
