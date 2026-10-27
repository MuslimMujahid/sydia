import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop } from "../../components/Anim";
import { Card, Icon } from "../../components/Ui";
import { COLORS, EASE_IN_OUT, FONT } from "../../theme";
import { Caption, Line, LINES, spokenAt } from "../parts";

const RINA_AT = 0.15;

export const HOOK_SECONDS = RINA_AT + LINES["hook-rina"].duration + 0.5;

// Deadlines landing on the pile; the first two are already there on frame one,
// so the video never opens on an empty screen.
const NOTES = [
  {
    title: "Laporan bulanan",
    due: "Besok, 17.00",
    x: 500,
    y: 760,
    rot: -5,
    at: -1,
  },
  { title: "Revisi logo klien", due: "Kamis", x: 560, y: 930, rot: 4, at: -1 },
  {
    title: "Slide rapat",
    due: "Jumat",
    x: 470,
    y: 1100,
    rot: -3,
    at: spokenAt("hook-rina", RINA_AT, 1),
  },
  {
    title: "Balas email Pak Dimas",
    due: "Hari ini",
    x: 580,
    y: 1250,
    rot: 6,
    at: spokenAt("hook-rina", RINA_AT, 2),
  },
  {
    title: "Bayar listrik",
    due: "Tanggal 28",
    x: 480,
    y: 1380,
    rot: -6,
    at: spokenAt("hook-rina", RINA_AT, 2) + 0.2,
  },
];

export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const confusedAt = spokenAt("hook-rina", RINA_AT, 3);
  // A small, restless shake while the pile grows, settling into a slow drift.
  const shake = interpolate(t, [0, confusedAt], [1, 0.25], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={0.9} />
      <AbsoluteFill
        style={{
          translate: `${Math.sin(frame * 1.7) * 5 * shake}px ${Math.cos(frame * 1.3) * 4 * shake}px`,
          rotate: `${interpolate(t, [confusedAt, HOOK_SECONDS], [0, -2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_IN_OUT,
          })}deg`,
        }}
      >
        {NOTES.map((n) => (
          <div
            key={n.title}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              translate: "-50% -50%",
              rotate: `${n.rot}deg`,
            }}
          >
            <Pop at={n.at}>
              <Card
                style={{
                  width: 700,
                  padding: "30px 36px",
                  display: "flex",
                  alignItems: "center",
                  gap: 26,
                }}
              >
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 24,
                    background: "#ffe3ec",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="calendar" size={40} color={COLORS.accent} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {n.title}
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 600,
                      color: COLORS.accent,
                      marginTop: 4,
                    }}
                  >
                    Deadline: {n.due}
                  </div>
                </div>
              </Card>
            </Pop>
          </div>
        ))}
      </AbsoluteFill>
      <Caption id="hook-rina" at={RINA_AT} speaker="rina" />
      <Line id="hook-rina" at={RINA_AT} />
    </AbsoluteFill>
  );
};
