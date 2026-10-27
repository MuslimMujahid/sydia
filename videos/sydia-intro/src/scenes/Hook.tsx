import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop, Rise } from "../components/Anim";
import { Card, Icon, IconTile } from "../components/Ui";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT, wordAt } from "../theme";

type Note = {
  title: string;
  body: string;
  icon: "calendar" | "bell" | "file";
  tint: string;
};

const KEY_NOTES: (Note & { x: number; y: number; rot: number; at: number })[] =
  [
    {
      title: "Pak Budi",
      body: "Meeting Kamis jam 3 ya, jangan lupa",
      icon: "calendar",
      tint: "#ffe9dc",
      x: 600,
      y: 290,
      rot: -4,
      at: wordAt("hook", 0),
    },
    {
      title: "PLN",
      body: "Tagihan listrik Oktober Rp487.500",
      icon: "bell",
      tint: "#ffe3ec",
      x: 1340,
      y: 420,
      rot: 3,
      at: wordAt("hook", 3),
    },
    {
      title: "Kantor",
      body: "Kontrak_final_v3.pdf",
      icon: "file",
      tint: "#ede4ff",
      x: 760,
      y: 600,
      rot: -2,
      at: wordAt("hook", 5),
    },
  ];

// The noise that buries the important messages.
const NOISE_BUBBLES = [
  "Grup Keluarga: 128 pesan baru",
  "Promo 11.11 dimulai!",
  "Arisan RT: siapa yang bawa kue?",
  "Kak, paketnya sudah sampai",
  "Reuni SMA: foto kemarin 📸",
  "Grup Kantor: 64 pesan baru",
  "Mama: sudah makan?",
  "Diskon ongkir s/d 50rb",
  "Tim Proyek: cek dokumen ya",
  "Teman Futsal: jadi main?",
  "Kurir: di depan rumah",
  "Grup Alumni: 212 pesan baru",
];

const NoiseBubble = ({
  text,
  index,
}: {
  readonly text: string;
  readonly index: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = (wordAt("hook", 8) + index * 0.07) * fps;
  // Pseudo-random but fixed placement for each bubble.
  const x = 120 + ((index * 547) % 1680);
  const y = 140 + ((index * 331) % 620);
  const drift = interpolate(frame, [start, start + 4 * fps], [0, -40]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + drift,
        translate: "-50% -50%",
        rotate: `${((index * 37) % 14) - 7}deg`,
      }}
    >
      <Pop at={start / fps}>
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 24,
            padding: "16px 26px",
            fontSize: 28,
            fontWeight: 500,
            color: COLORS.muted,
            whiteSpace: "nowrap",
            boxShadow: "rgba(23,20,25,0.10) 0 18px 40px -18px",
            border: `1.5px solid ${COLORS.border}`,
          }}
        >
          {text}
        </div>
      </Pop>
    </div>
  );
};

export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const forgetAt = wordAt("hook", 12) * fps;
  const fade = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN_OUT,
  } as const;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Aurora intensity={0.7} />
      <AbsoluteFill
        style={{
          opacity: interpolate(
            frame,
            [forgetAt - 6, forgetAt + 0.6 * fps],
            [1, 0.12],
            fade,
          ),
          filter: `blur(${interpolate(frame, [forgetAt - 6, forgetAt + 0.6 * fps], [0, 14], fade)}px)`,
          scale: interpolate(
            frame,
            [forgetAt - 6, forgetAt + 1.4 * fps],
            [1, 0.94],
            fade,
          ),
        }}
      >
        {KEY_NOTES.map((note) => (
          <div
            key={note.title}
            style={{
              position: "absolute",
              left: note.x,
              top: note.y,
              translate: "-50% -50%",
              rotate: `${note.rot}deg`,
            }}
          >
            <Pop at={note.at}>
              <Card
                style={{
                  padding: "32px 40px",
                  display: "flex",
                  gap: 26,
                  alignItems: "center",
                }}
              >
                <IconTile tint={note.tint} size={88}>
                  <Icon name={note.icon} size={44} />
                </IconTile>
                <div>
                  <div
                    style={{ fontSize: 30, fontWeight: 700, color: COLORS.ink }}
                  >
                    {note.title}
                  </div>
                  <div
                    style={{
                      fontSize: 40,
                      color: COLORS.muted,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {note.body}
                  </div>
                </div>
              </Card>
            </Pop>
          </div>
        ))}
        {NOISE_BUBBLES.map((text, i) => (
          <NoiseBubble key={text} text={text} index={i} />
        ))}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 150,
        }}
      >
        <Rise at={wordAt("hook", 8)} distance={30}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: COLORS.ink,
              opacity: interpolate(
                frame,
                [forgetAt - 10, forgetAt],
                [1, 0],
                fade,
              ),
              textAlign: "center",
            }}
          >
            Semuanya tercecer di chat.
          </div>
        </Rise>
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: "-0.05em",
            color: COLORS.ink,
            opacity: interpolate(
              frame,
              [forgetAt, forgetAt + 0.5 * fps],
              [0, 1],
              fade,
            ),
            scale: interpolate(
              frame,
              [forgetAt, forgetAt + 0.8 * fps],
              [1.08, 1],
              {
                ...fade,
                easing: EASE_OUT,
              },
            ),
          }}
        >
          Lalu{" "}
          <span
            style={{
              color: COLORS.muted,
              opacity: interpolate(
                frame,
                [forgetAt + 0.7 * fps, forgetAt + 1.8 * fps],
                [1, 0.18],
                fade,
              ),
              filter: `blur(${interpolate(frame, [forgetAt + 0.7 * fps, forgetAt + 1.8 * fps], [0, 6], fade)}px)`,
            }}
          >
            terlupa.
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
