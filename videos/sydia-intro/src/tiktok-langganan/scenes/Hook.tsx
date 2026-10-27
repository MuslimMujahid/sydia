import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop } from "../../components/Anim";
import { Card } from "../../components/Ui";
import { COLORS, FONT } from "../../theme";
import { Caption, Line, LINES, spokenAt } from "../voice";

const HOOK_AT = 0.05; // the caption shows from frame one
const BONCOS_AT = HOOK_AT + LINES["hook-rina"].duration + 0.25;

export const HOOK_SECONDS = BONCOS_AT + LINES["boncos-rina"].duration + 0.4;

// Subscriptions land on the pile as Rina names them. Plain names and a letter
// tile only: no third-party logos or brand colours.
const SUBS = [
  {
    name: "Netflix",
    note: "Diperpanjang tgl 27",
    x: 500,
    y: 640,
    rot: -4,
    at: -1, // already on screen at frame one
  },
  {
    name: "Spotify",
    note: "Diperpanjang tgl 3",
    x: 570,
    y: 800,
    rot: 3,
    at: spokenAt("hook-rina", HOOK_AT, 1),
  },
  {
    name: "ChatGPT Plus",
    note: "Diperpanjang tgl 12",
    x: 480,
    y: 960,
    rot: -3,
    at: spokenAt("hook-rina", HOOK_AT, 2),
  },
  {
    name: "Trial Canva Pro",
    note: "Habis 5 hari lagi",
    x: 580,
    y: 1120,
    rot: 5,
    at: spokenAt("hook-rina", HOOK_AT, 5),
  },
  {
    name: "Trial CapCut Pro",
    note: "Habis 9 hari lagi",
    x: 490,
    y: 1280,
    rot: -5,
    at: spokenAt("hook-rina", HOOK_AT, 7),
  },
];

const TINTS = ["#ffe9dc", "#ffe3ec", "#ede4ff"];

export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const debitAt = spokenAt("boncos-rina", BONCOS_AT, 4) - 0.1;
  const boncosAt = spokenAt("boncos-rina", BONCOS_AT, 6);
  // A hard shake right on "Boncos!", easing off quickly.
  const jolt = interpolate(t, [boncosAt - 0.05, boncosAt + 0.6], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dim = interpolate(t, [debitAt, debitAt + 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={0.9} />
      <AbsoluteFill
        style={{
          translate: `${Math.sin(frame * 2.3) * 16 * jolt}px ${Math.cos(frame * 1.9) * 12 * jolt}px`,
          filter: `blur(${dim * 4}px)`,
          opacity: 1 - dim * 0.45,
        }}
      >
        {SUBS.map((s, i) => (
          <div
            key={s.name}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              translate: "-50% -50%",
              rotate: `${s.rot}deg`,
            }}
          >
            <Pop at={s.at}>
              <Card
                style={{
                  width: 680,
                  padding: "26px 32px",
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                }}
              >
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 24,
                    background: TINTS[i % TINTS.length],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 38,
                    fontWeight: 800,
                    color: COLORS.ink,
                    flexShrink: 0,
                  }}
                >
                  {s.name.replace("Trial ", "")[0]}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 600,
                      color: COLORS.muted,
                      marginTop: 2,
                    }}
                  >
                    {s.note}
                  </div>
                </div>
              </Card>
            </Pop>
          </div>
        ))}
      </AbsoluteFill>

      {/* The surprise debit that makes it hurt. */}
      <div
        style={{
          position: "absolute",
          left: 540,
          top: 960,
          translate: `calc(-50% + ${Math.sin(frame * 2.1) * 10 * jolt}px) -50%`,
        }}
      >
        <Pop at={debitAt}>
          <div
            style={{
              width: 800,
              padding: "36px 40px",
              borderRadius: 36,
              background: "#17121f",
              color: "#fff",
              boxShadow: "rgba(23,20,25,0.35) 0 40px 80px -30px",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 600, opacity: 0.7 }}>
              Notifikasi rekening
            </div>
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                marginTop: 8,
              }}
            >
              Saldo terpotong{" "}
              <span style={{ color: COLORS.coral }}>Rp186.000</span>
            </div>
            <div style={{ fontSize: 30, opacity: 0.75, marginTop: 6 }}>
              Perpanjangan otomatis Netflix
            </div>
          </div>
        </Pop>
      </div>

      <Caption id="hook-rina" at={HOOK_AT} speaker="rina" />
      <Caption id="boncos-rina" at={BONCOS_AT} speaker="rina" />
      <Line id="hook-rina" at={HOOK_AT} />
      <Line id="boncos-rina" at={BONCOS_AT} />
    </AbsoluteFill>
  );
};
