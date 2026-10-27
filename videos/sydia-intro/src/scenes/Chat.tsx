import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop, Rise, Typewriter } from "../components/Anim";
import { Bubble, Phone } from "../components/Phone";
import { Icon } from "../components/Ui";
import { COLORS, EASE_OUT, FONT, wordAt } from "../theme";

const MESSAGE = "ingetin bayar listrik tgl 28 ya";
const TYPE_AT = 1.0;
const SEND_AT = 3.1;
const REPLY_AT = 4.3;

export const TypingDots = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 4px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            background: COLORS.muted,
            opacity: 0.35 + 0.5 * Math.max(0, Math.sin((frame - i * 4) / 4)),
          }}
        />
      ))}
    </div>
  );
};

export const Chat = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sent = frame >= SEND_AT * fps;
  const typing = frame >= (SEND_AT + 0.4) * fps && frame < REPLY_AT * fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 170 }}>
        <div
          style={{
            fontSize: 112,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1.08,
          }}
        >
          <Rise at={wordAt("chat", 0) - 0.1}>Cukup chat</Rise>
          <Rise
            at={wordAt("chat", 3) - 0.1}
            style={{ display: "flex", alignItems: "center", gap: 26 }}
          >
            lewat
            <Pop at={wordAt("chat", 4) - 0.05}>
              <Img
                src={staticFile("whatsapp.svg")}
                style={{ width: 104, height: 104, marginTop: 10 }}
              />
            </Pop>
            WhatsApp.
          </Rise>
        </div>
        <Rise at={wordAt("chat", 5) - 0.1} style={{ marginTop: 40 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 500,
              color: COLORS.muted,
              letterSpacing: "-0.02em",
            }}
          >
            Tulis saja seperti biasa.
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
            scale: "0.88",
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
            rotate: `${interpolate(frame, [0, 7 * fps], [-3, 1])}deg`,
          }}
        >
          <Phone
            input={
              sent ? undefined : (
                <Typewriter
                  text={MESSAGE}
                  at={TYPE_AT}
                  cps={16}
                  style={{ fontSize: 25 }}
                />
              )
            }
          >
            <Bubble from="sydia">
              Halo! Ada yang bisa saya bantu hari ini?
            </Bubble>
            {sent ? (
              <Pop
                at={SEND_AT}
                style={{
                  alignSelf: "flex-end",
                  transformOrigin: "right bottom",
                }}
              >
                <Bubble from="me">{MESSAGE}</Bubble>
              </Pop>
            ) : null}
            {typing ? (
              <Bubble from="sydia">
                <TypingDots />
              </Bubble>
            ) : null}
            {frame >= REPLY_AT * fps ? (
              <Pop
                at={REPLY_AT}
                style={{
                  alignSelf: "flex-start",
                  transformOrigin: "left bottom",
                }}
              >
                <Bubble from="sydia">
                  Siap! Nanti saya ingatkan bayar listrik tanggal 28 Oktober,
                  jam 09.00.
                  <div
                    style={{
                      marginTop: 14,
                      padding: "14px 18px",
                      borderRadius: 18,
                      background: "#fff3ee",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="bell" size={30} color={COLORS.accent} />
                    Bayar listrik · 28 Okt, 09.00
                  </div>
                </Bubble>
              </Pop>
            ) : null}
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
