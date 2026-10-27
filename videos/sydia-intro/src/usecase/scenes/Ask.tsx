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
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT } from "../../theme";
import { Chart, DateDivider, Line, LINES, Sfx, spokenAt } from "../parts";
import { USECASE_SCRIPT } from "../script";

// The chat opens on 24 September and scrolls down to today before Rina types.
const SCROLL_FROM = 0.3;
const SCROLL_TO = 1.6;
const HISTORY_SCROLL = 400; // px the history starts pushed down, revealing the oldest messages
const RINA_AT = 1.7;
const SEND_AT = RINA_AT + LINES["ask-rina"].duration + 0.25;
const SYDIA_AT = SEND_AT + 1.0;
const QUESTION = USECASE_SCRIPT[3].text;

export const ASK_SECONDS = SYDIA_AT + LINES["ask-sydia"].duration + 0.7;

export const Ask = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 170 }}>
        <Rise at={0.2}>
          <div
            style={{
              fontSize: 112,
              fontWeight: 700,
              letterSpacing: "-0.05em",
              lineHeight: 1.06,
            }}
          >
            Tinggal
            <br />
            tanya Sydia.
          </div>
        </Rise>
        <Rise
          at={spokenAt("ask-sydia", SYDIA_AT + 0.15, 2)}
          style={{ marginTop: 40 }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 1.15,
            }}
          >
            <GradientText>Tanpa perlu ingat</GradientText>
            <br />
            <GradientText>nama file.</GradientText>
          </div>
        </Rise>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: 200,
        }}
      >
        <div
          style={{
            scale: "0.92",
            translate: interpolate(
              frame,
              [0, 0.8 * fps],
              ["0px 140px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_OUT,
              },
            ),
          }}
        >
          <Phone
            input={
              t >= RINA_AT && t < SEND_AT ? (
                <Typewriter
                  text={QUESTION}
                  at={RINA_AT}
                  cps={QUESTION.length / (LINES["ask-rina"].duration - 0.3)}
                  style={{ fontSize: 25, lineHeight: 1.35, padding: "14px 0" }}
                />
              ) : undefined
            }
          >
            {/* A month of everyday use, scrolled past on the way to today. */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                translate: `0px ${interpolate(
                  t,
                  [SCROLL_FROM, SCROLL_TO],
                  [HISTORY_SCROLL, 0],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE_IN_OUT,
                  },
                )}px`,
              }}
            >
              <DateDivider>24 September</DateDivider>
              <Bubble from="me">{USECASE_SCRIPT[0].text}</Bubble>
              <Bubble from="sydia">{USECASE_SCRIPT[1].text}</Bubble>
              <DateDivider>3 Oktober</DateDivider>
              <Bubble from="me">Ingetin bayar listrik tanggal 28, ya.</Bubble>
              <Bubble from="sydia">
                Siap, nanti saya ingatkan tanggal 28 Oktober, jam 09.00.
              </Bubble>
              <DateDivider>17 Oktober</DateDivider>
              <Bubble from="me">Catat, ukuran sepatu Dina 38.</Bubble>
              <Bubble from="sydia">Sudah saya catat.</Bubble>
              <DateDivider>Hari ini</DateDivider>
              <Bubble from="sydia">
                Selamat pagi, Rina! Jam 10.00 nanti presentasi ke PT Arunika.
                Semangat!
              </Bubble>
            </div>
            {t >= SEND_AT ? (
              <Pop
                at={SEND_AT}
                style={{
                  alignSelf: "flex-end",
                  transformOrigin: "right bottom",
                }}
              >
                <Bubble from="me">{QUESTION}</Bubble>
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
                <Bubble from="sydia" style={{ padding: 8 }}>
                  <Chart width={400} />
                  <div
                    style={{
                      padding: "12px 14px 6px",
                      fontSize: 26,
                      lineHeight: 1.4,
                    }}
                  >
                    Ini grafiknya. Anda simpan 24 September, dari Mbak Sinta.
                    Semangat presentasinya!
                  </div>
                </Bubble>
              </Pop>
            ) : null}
          </Phone>
        </div>
      </AbsoluteFill>

      <Line id="ask-rina" at={RINA_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={SYDIA_AT} />
      <Line id="ask-sydia" at={SYDIA_AT + 0.15} />
    </AbsoluteFill>
  );
};
