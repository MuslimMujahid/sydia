import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop } from "../../components/Anim";
import { Bubble } from "../../components/Phone";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT } from "../../theme";
import { Audience, Chart, Line, LINES, Sfx, Slide } from "../parts";
import { USECASE_SCRIPT } from "../script";

const DROP_AT = 0.3;
const SHIFT_AT = 1.7;
const RINA_AT = 2.3;
const SYDIA_AT = RINA_AT + LINES["thanks-rina"].duration + 0.4;

export const SAVED_SECONDS = SYDIA_AT + LINES["thanks-sydia"].duration + 0.9;

export const Saved = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const drop = interpolate(t, [DROP_AT, DROP_AT + 0.9], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  const shift = interpolate(t, [SHIFT_AT, SHIFT_AT + 0.8], [0, 1], {
    ...clamp,
    easing: EASE_IN_OUT,
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />

      <div
        style={{
          position: "absolute",
          left: 960 - 640 * 0.92 - shift * 250,
          top: 70 + shift * 50,
          scale: String(0.92 - shift * 0.1),
          transformOrigin: "left top",
        }}
      >
        <Slide
          chart={
            <div
              style={{
                position: "absolute",
                inset: 0,
                translate: `${(1 - drop) * 700}px ${(1 - drop) * 300}px`,
                rotate: `${(1 - drop) * 12}deg`,
                scale: String(0.6 + drop * 0.4),
                opacity: Math.min(1, drop * 3),
                borderRadius: 22,
                overflow: "hidden",
                boxShadow: "rgba(23,20,25,0.12) 0 20px 40px -20px",
              }}
            >
              <Chart
                width={520}
                grow={interpolate(
                  t,
                  [DROP_AT + 0.6, DROP_AT + 1.6],
                  [0, 1],
                  clamp,
                )}
              />
            </div>
          }
        />
      </div>

      <Audience
        nod={interpolate(t, [DROP_AT + 1, DROP_AT + 1.6], [0, 1], clamp)}
      />

      <div
        style={{
          position: "absolute",
          right: 120,
          top: 220,
          width: 560,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {t >= RINA_AT ? (
          <Pop
            at={RINA_AT}
            style={{ alignSelf: "flex-end", transformOrigin: "right bottom" }}
          >
            <Bubble
              from="me"
              style={{
                fontSize: 34,
                boxShadow: "rgba(23,20,25,0.12) 0 20px 40px -20px",
              }}
            >
              {USECASE_SCRIPT[5].text}
            </Bubble>
          </Pop>
        ) : null}
        {t >= SYDIA_AT ? (
          <Pop
            at={SYDIA_AT}
            style={{ alignSelf: "flex-start", transformOrigin: "left bottom" }}
          >
            <Bubble
              from="sydia"
              style={{
                fontSize: 34,
                boxShadow: "rgba(23,20,25,0.12) 0 20px 40px -20px",
              }}
            >
              {USECASE_SCRIPT[6].text}
            </Bubble>
          </Pop>
        ) : null}
      </div>

      <Sfx kind="sent" at={RINA_AT} />
      <Line id="thanks-rina" at={RINA_AT + 0.05} />
      <Sfx kind="received" at={SYDIA_AT} />
      <Line id="thanks-sydia" at={SYDIA_AT + 0.1} />
    </AbsoluteFill>
  );
};
