import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise, Typewriter } from "../../components/Anim";
import { Bubble, Phone } from "../../components/Phone";
import { GradientText } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { Chart, DateDivider, Line, LINES, Sfx } from "../parts";
import { USECASE_SCRIPT } from "../script";

const IMAGE_AT = 0.9;
const RINA_AT = 1.3;
const SEND_AT = RINA_AT + LINES["flash-rina"].duration + 0.2;
const SYDIA_AT = SEND_AT + 1.1;
const CAPTION = USECASE_SCRIPT[0].text;

export const FLASHBACK_SECONDS = SYDIA_AT + LINES["flash-sydia"].duration + 0.6;

export const Flashback = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={0.8} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 170 }}>
        <Rise at={0.15}>
          <div
            style={{
              fontSize: 132,
              fontWeight: 700,
              letterSpacing: "-0.05em",
              lineHeight: 1.05,
            }}
          >
            Satu bulan
            <br />
            <GradientText>lalu.</GradientText>
          </div>
        </Rise>
        <Rise at={0.6} style={{ marginTop: 36 }}>
          <div
            style={{
              fontSize: 50,
              fontWeight: 500,
              color: COLORS.muted,
              letterSpacing: "-0.02em",
              lineHeight: 1.3,
            }}
          >
            Mbak Sinta kirim grafik penjualan.
            <br />
            Rina titip ke Sydia.
          </div>
        </Rise>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: 210,
        }}
      >
        <div
          style={{
            scale: "0.9",
            translate: interpolate(
              frame,
              [0, 0.9 * fps],
              ["0px 160px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_OUT,
              },
            ),
            rotate: `${interpolate(frame, [0, FLASHBACK_SECONDS * fps], [-2, 1])}deg`,
          }}
        >
          <Phone
            input={
              t >= RINA_AT && t < SEND_AT ? (
                <Typewriter
                  text={CAPTION}
                  at={RINA_AT}
                  cps={CAPTION.length / (LINES["flash-rina"].duration - 0.3)}
                  style={{ fontSize: 25, lineHeight: 1.35, padding: "14px 0" }}
                />
              ) : undefined
            }
          >
            <DateDivider>24 September</DateDivider>
            {t >= IMAGE_AT ? (
              <Pop
                at={IMAGE_AT}
                style={{
                  alignSelf: "flex-end",
                  transformOrigin: "right bottom",
                }}
              >
                <Bubble from="me" style={{ padding: 8 }}>
                  <Chart width={380} />
                </Bubble>
              </Pop>
            ) : null}
            {t >= SEND_AT ? (
              <Pop
                at={SEND_AT}
                style={{
                  alignSelf: "flex-end",
                  transformOrigin: "right bottom",
                }}
              >
                <Bubble from="me">{CAPTION}</Bubble>
              </Pop>
            ) : null}
            {t >= SEND_AT + 0.3 && t < SYDIA_AT ? (
              <Bubble from="sydia">
                <TypingDots />
              </Bubble>
            ) : null}
            {t >= SYDIA_AT ? (
              <Pop
                at={SYDIA_AT}
                style={{
                  alignSelf: "flex-start",
                  transformOrigin: "left bottom",
                }}
              >
                <Bubble from="sydia">{USECASE_SCRIPT[1].text}</Bubble>
              </Pop>
            ) : null}
          </Phone>
        </div>
      </AbsoluteFill>

      <Sfx kind="sent" at={IMAGE_AT} />
      <Line id="flash-rina" at={RINA_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={SYDIA_AT} />
      <Line id="flash-sydia" at={SYDIA_AT + 0.1} />
    </AbsoluteFill>
  );
};
