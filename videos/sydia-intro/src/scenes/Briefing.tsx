import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop, Rise } from "../components/Anim";
import { Bubble, Phone } from "../components/Phone";
import { SyncedWords } from "../components/SyncedWords";
import { Icon } from "../components/Ui";
import { COLORS, EASE_OUT, FONT, wordAt } from "../theme";

const PLAN = [
  { icon: "calendar", text: "10.00 Rapat tim mingguan" },
  { icon: "check", text: "Kirim proposal ke Pak Budi" },
  { icon: "bell", text: "Bayar listrik, jatuh tempo hari ini" },
] as const;

export const Briefing = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const msgAt = wordAt("briefing", 2) - 0.2;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora
        intensity={1.5}
        blobs={[
          {
            color: COLORS.amber,
            x: 20,
            y: interpolate(frame, [0, 6 * fps], [115, 85]),
            size: 1300,
            speed: 0.3,
          },
          { color: COLORS.coral, x: 90, y: 10, size: 900, speed: 0.4 },
        ]}
      />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 170 }}>
        <Pop at={0.1} style={{ marginBottom: 30, width: 110 }}>
          <Icon name="sun" size={110} color={COLORS.amber} />
        </Pop>
        <SyncedWords
          scene="briefing"
          from={0}
          to={1}
          highlight={[1]}
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1.1,
            maxWidth: 1000,
          }}
        />
        <SyncedWords
          scene="briefing"
          from={2}
          to={4}
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1.1,
            maxWidth: 1000,
          }}
        />
        <SyncedWords
          scene="briefing"
          from={5}
          to={8}
          style={{
            fontSize: 56,
            fontWeight: 500,
            color: COLORS.muted,
            marginTop: 30,
          }}
        />
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
            rotate: `${interpolate(frame, [0, 6 * fps], [2, -1])}deg`,
          }}
        >
          <Phone>
            <Pop
              at={msgAt}
              style={{
                alignSelf: "flex-start",
                transformOrigin: "left bottom",
              }}
            >
              <Bubble from="sydia" style={{ fontSize: 26, maxWidth: "100%" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>
                  Selamat pagi, Rina! Ini rencana hari ini:
                </div>
                {PLAN.map((item, i) => (
                  <Rise
                    key={item.text}
                    at={msgAt + 0.35 + i * 0.22}
                    distance={16}
                    blur={false}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "12px 0",
                        borderTop:
                          i === 0 ? "none" : `1.5px solid ${COLORS.hairline}`,
                      }}
                    >
                      <Icon name={item.icon} size={30} color={COLORS.accent} />
                      {item.text}
                    </div>
                  </Rise>
                ))}
                <div style={{ marginTop: 10, color: COLORS.muted }}>
                  Semangat, ya!
                </div>
              </Bubble>
            </Pop>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
