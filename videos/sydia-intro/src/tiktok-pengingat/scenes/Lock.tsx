import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Logo } from "../../components/Ui";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT } from "../../theme";
import { Sfx } from "../../tiktok/parts";
import { Caption, Line, LINES } from "../voice";

const N1_AT = 0.5;
const REMIND_VO = N1_AT + 0.1;
const TIME2_AT = REMIND_VO + LINES["remind-sydia"].duration + 0.7;
const N2_AT = TIME2_AT + 0.5;
const AGAIN_VO = N2_AT + 0.1;

export const LOCK_SECONDS = AGAIN_VO + LINES["again-sydia"].duration + 0.6;

// The evening lock screen: Sydia's reminder lands, then follows up half an hour later.
const Wallpaper = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ background: "#17121f", overflow: "hidden" }}>
      {[
        { c: COLORS.violet, x: 20, y: 25, s: 1100 },
        { c: COLORS.coral, x: 85, y: 70, s: 1000 },
        { c: COLORS.amber, x: 30, y: 105, s: 900 },
      ].map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${b.x + Math.sin(t * 0.4 + i) * 3}%`,
            top: `${b.y + Math.cos(t * 0.3 + i) * 3}%`,
            width: b.s,
            height: b.s,
            translate: "-50% -50%",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c} 0%, transparent 65%)`,
            opacity: 0.32,
            filter: "blur(50px)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const Clock = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const roll = interpolate(
    frame,
    [(TIME2_AT - 0.2) * fps, (TIME2_AT + 0.25) * fps],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_IN_OUT,
    },
  );
  const digits = (text: string, offset: number): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    textAlign: "center",
    translate: `0px ${offset * 100}%`,
    opacity: 1 - Math.abs(offset),
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 560,
        left: 0,
        right: 0,
        textAlign: "center",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 600, opacity: 0.8 }}>Selasa</div>
      <div
        style={{
          position: "relative",
          height: 220,
          fontSize: 210,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          overflow: "hidden",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div style={digits("19.00", -roll)}>19.00</div>
        <div style={digits("19.30", 1 - roll)}>19.30</div>
      </div>
    </div>
  );
};

const Notification = ({
  text,
  top,
  dim,
}: {
  readonly text: string;
  readonly top: number;
  readonly dim: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: 90,
      width: 860,
      top,
      borderRadius: 40,
      padding: "28px 32px",
      background: "rgba(255,255,255,0.9)",
      boxShadow: "rgba(0,0,0,0.25) 0 30px 60px -30px",
      opacity: 1 - dim * 0.35,
      scale: String(1 - dim * 0.05),
      display: "flex",
      gap: 22,
      alignItems: "flex-start",
    }}
  >
    <div
      style={{
        width: 76,
        height: 76,
        borderRadius: 22,
        background: COLORS.canvas,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Logo size={52} />
    </div>
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 28,
        }}
      >
        <span style={{ fontWeight: 700 }}>Sydia</span>
        <span style={{ color: COLORS.muted }}>sekarang</span>
      </div>
      <div style={{ fontSize: 34, lineHeight: 1.35, marginTop: 4 }}>{text}</div>
    </div>
  </div>
);

export const Lock = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const in1 = interpolate(t, [N1_AT, N1_AT + 0.45], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  const in2 = interpolate(t, [N2_AT, N2_AT + 0.45], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Wallpaper />
      <Clock />
      {/* The older notification slides down as the follow-up arrives on top. */}
      <div style={{ opacity: in1, translate: `0px ${(1 - in1) * -60}px` }}>
        <Notification
          text="Rina, waktunya beli obat untuk Mama."
          top={880 + in2 * 250}
          dim={in2}
        />
      </div>
      {t >= N2_AT ? (
        <div style={{ opacity: in2, translate: `0px ${(1 - in2) * -60}px` }}>
          <Notification
            text="Belum sempat, ya? Saya ingatkan lagi. Obat Mama jangan sampai lupa."
            top={880}
            dim={0}
          />
        </div>
      ) : null}

      <Caption id="remind-sydia" at={REMIND_VO} speaker="sydia" tone="dark" />
      <Caption id="again-sydia" at={AGAIN_VO} speaker="sydia" tone="dark" />

      <Sfx kind="received" at={N1_AT} />
      <Line id="remind-sydia" at={REMIND_VO} />
      <Sfx kind="received" at={N2_AT} />
      <Line id="again-sydia" at={AGAIN_VO} />
    </AbsoluteFill>
  );
};
