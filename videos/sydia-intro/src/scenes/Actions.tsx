import type React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop, Rise } from "../components/Anim";
import { Card, GradientText, Icon, IconTile } from "../components/Ui";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT, wordAt } from "../theme";

const WORDS = [
  { text: "tugas", at: wordAt("actions", 4) },
  { text: "pengingat", at: wordAt("actions", 5) },
  { text: "jadwal", at: wordAt("actions", 7) },
];

// Rolls through the words like a slot reel, landing on each as it is spoken.
const WordReel = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let position = 0;
  WORDS.forEach((w, i) => {
    if (i === 0) return;
    position += interpolate(t, [w.at - 0.12, w.at + 0.25], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_IN_OUT,
    });
  });

  return (
    <span
      style={{
        display: "inline-block",
        height: "1.18em",
        overflow: "hidden",
        verticalAlign: "bottom",
      }}
    >
      <span
        style={{ display: "block", translate: `0px ${-position * 1.18}em` }}
      >
        {WORDS.map((w) => (
          <span key={w.text} style={{ display: "block", height: "1.18em" }}>
            <GradientText>{w.text}</GradientText>
          </span>
        ))}
      </span>
    </span>
  );
};

const ActionCard = ({
  at,
  icon,
  tint,
  kind,
  title,
  meta,
  done,
}: {
  readonly at: number;
  readonly icon: React.ReactNode;
  readonly tint: string;
  readonly kind: string;
  readonly title: string;
  readonly meta: string;
  readonly done?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const checked = done !== undefined && frame >= done * fps;

  return (
    <Rise at={at} distance={90} duration={0.7}>
      <Card style={{ width: 470, padding: 36 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 28,
          }}
        >
          <IconTile tint={tint} size={68}>
            {icon}
          </IconTile>
          <div style={{ fontSize: 26, fontWeight: 600, color: COLORS.muted }}>
            {kind}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          {done !== undefined ? (
            <div
              style={{
                width: 40,
                height: 40,
                marginTop: 4,
                borderRadius: 12,
                flexShrink: 0,
                border: checked ? "none" : `2.5px solid rgba(23,20,25,0.22)`,
                background: checked ? COLORS.accent : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? (
                <Pop at={done}>
                  <Icon name="check" size={28} color="#fff" />
                </Pop>
              ) : null}
            </div>
          ) : null}
          <div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                color: COLORS.ink,
              }}
            >
              {title}
            </div>
            <div style={{ fontSize: 28, color: COLORS.muted, marginTop: 10 }}>
              {meta}
            </div>
          </div>
        </div>
      </Card>
    </Rise>
  );
};

export const Actions = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const autoAt = wordAt("actions", 10);
  const swap = interpolate(
    frame,
    [(autoAt - 0.15) * fps, (autoAt + 0.3) * fps],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_IN_OUT,
    },
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <div
          style={{
            position: "relative",
            fontSize: 128,
            fontWeight: 700,
            letterSpacing: "-0.045em",
          }}
        >
          <Rise at={0.15}>
            <div
              style={{
                opacity: 1 - swap,
                translate: `0px ${-swap * 40}px`,
                whiteSpace: "nowrap",
              }}
            >
              Pesan jadi <WordReel />
            </div>
          </Rise>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 28,
              opacity: swap,
              translate: `0px ${(1 - swap) * 40}px`,
            }}
          >
            <Icon name="sparkle" size={110} color={COLORS.coral} />
            <GradientText>Otomatis.</GradientText>
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 44,
          paddingTop: 280,
          scale: interpolate(
            frame,
            [autoAt * fps, (autoAt + 0.5) * fps],
            [1, 1.03],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_OUT,
            },
          ),
        }}
      >
        <ActionCard
          at={WORDS[0].at - 0.1}
          icon={<Icon name="check" size={34} />}
          tint="#ffe9dc"
          kind="Tugas"
          title="Kirim proposal ke Pak Budi"
          meta="Jumat"
          done={autoAt + 0.2}
        />
        <ActionCard
          at={WORDS[1].at - 0.1}
          icon={<Icon name="bell" size={34} />}
          tint="#ffe3ec"
          kind="Pengingat"
          title="Bayar listrik"
          meta="28 Okt, 09.00"
        />
        <ActionCard
          at={WORDS[2].at - 0.1}
          icon={
            <Img
              src={staticFile("google-calendar.svg")}
              style={{ width: 38, height: 38 }}
            />
          }
          tint="#ede4ff"
          kind="Kalender"
          title="Meeting dengan Pak Budi"
          meta="Kamis, 15.00–16.00"
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
