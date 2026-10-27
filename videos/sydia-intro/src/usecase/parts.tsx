import { useId } from "react";
import type React from "react";
import { Audio } from "@remotion/media";
import {
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PhoneFrame } from "../components/Phone";
import { Icon } from "../components/Ui";
import { COLORS, EASE_OUT, GRADIENT } from "../theme";
import timings from "./voice-timings.json";
import type { LineId } from "./script";

export const LINES = timings;

// Seconds into the scene at which a word of a line is spoken, given when the line starts.
export const spokenAt = (line: LineId, lineStart: number, wordIndex: number) =>
  lineStart + timings[line].words[wordIndex].start;

// One dialogue clip, placed at `at` seconds into its scene.
export const Line = ({
  id,
  at,
}: {
  readonly id: LineId;
  readonly at: number;
}) => {
  const { fps } = useVideoConfig();
  return (
    <Audio
      name={id}
      src={staticFile(`usecase/${id}.mp3`)}
      from={Math.round(at * fps)}
    />
  );
};

export const Sfx = ({
  kind,
  at,
}: {
  readonly kind: "sent" | "received";
  readonly at: number;
}) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={`Sfx ${kind}`} from={Math.round(at * fps)} layout="none">
      <Audio
        src={staticFile(`usecase/sfx-${kind}.mp3`)}
        volume={kind === "sent" ? 0.35 : 0.45}
      />
    </Sequence>
  );
};

// The sales chart Mbak Sinta shared. `grow` animates the bars from 0 to 1.
export const Chart = ({
  width,
  grow = 1,
}: {
  readonly width: number;
  readonly grow?: number;
}) => {
  const bars = [
    { label: "Jul", value: 0.58 },
    { label: "Agu", value: 0.76 },
    { label: "Sep", value: 1 },
  ];
  // Each chart needs its own gradient id: a shared one resolves to whichever
  // copy comes first in the page, which may sit in a hidden, premounted scene.
  const gradientId = `bar-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      width={width}
      height={width * 0.7}
      viewBox="0 0 400 280"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff8a4c" />
          <stop offset="55%" stopColor="#f06694" />
          <stop offset="100%" stopColor="#8c5cff" />
        </linearGradient>
      </defs>
      <rect width="400" height="280" rx="18" fill="#ffffff" />
      <text
        x="28"
        y="44"
        fontSize="22"
        fontWeight="700"
        fill={COLORS.ink}
        fontFamily="inherit"
      >
        Penjualan Q3
      </text>
      <text
        x="372"
        y="44"
        fontSize="22"
        fontWeight="800"
        fill={COLORS.accent}
        textAnchor="end"
        fontFamily="inherit"
      >
        +32%
      </text>
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1="28"
          x2="372"
          y1={90 + i * 55}
          y2={90 + i * 55}
          stroke="rgba(23,20,25,0.07)"
          strokeWidth="2"
        />
      ))}
      {bars.map((b, i) => {
        const h =
          160 * b.value * Math.min(1, Math.max(0, grow * 1.4 - i * 0.2));
        return (
          <g key={b.label}>
            <rect
              x={60 + i * 110}
              y={240 - h}
              width="72"
              height={h}
              rx="12"
              fill={`url(#${gradientId})`}
            />
            <text
              x={96 + i * 110}
              y="268"
              fontSize="18"
              fill={COLORS.muted}
              textAnchor="middle"
              fontFamily="inherit"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// The client deck's slide, with the chart slot either empty or filled.
export const Slide = ({ chart }: { readonly chart?: React.ReactNode }) => (
  <div
    style={{
      width: 1280,
      height: 720,
      borderRadius: 28,
      background: COLORS.surface,
      boxShadow:
        "rgba(23,20,25,0.10) 0 40px 90px -30px, rgba(23,20,25,0.06) 0 4px 10px",
      border: `1.5px solid ${COLORS.border}`,
      padding: "64px 72px",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}
  >
    <div style={{ fontSize: 26, fontWeight: 600, color: COLORS.accent }}>
      Presentasi untuk PT Arunika
    </div>
    <div
      style={{
        fontSize: 60,
        fontWeight: 700,
        letterSpacing: "-0.035em",
        marginTop: 8,
      }}
    >
      Pertumbuhan Penjualan Q3
    </div>
    <div
      style={{
        height: 6,
        width: 120,
        borderRadius: 3,
        backgroundImage: GRADIENT,
        marginTop: 22,
      }}
    />
    <div style={{ display: "flex", gap: 56, marginTop: 44, flex: 1 }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 26,
          fontSize: 32,
          paddingTop: 10,
        }}
      >
        {[
          "Naik 32% dibanding Q2",
          "1.240 pelanggan baru",
          "Target Q4: Rp4,8 miliar",
        ].map((t) => (
          <div
            key={t}
            style={{ display: "flex", alignItems: "center", gap: 18 }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: COLORS.coral,
              }}
            />
            {t}
          </div>
        ))}
      </div>
      <div style={{ width: 520, height: 364, position: "relative" }}>
        {chart}
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        right: 48,
        bottom: 36,
        fontSize: 22,
        color: COLORS.muted,
      }}
    >
      7 / 12
    </div>
  </div>
);

// The empty chart slot, gently pulsing so the gap reads at a glance.
export const EmptySlot = () => {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame / 12));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 22,
        border: `4px dashed rgba(239,90,138,${0.25 + 0.5 * pulse})`,
        background: "rgba(239,90,138,0.04)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        color: COLORS.muted,
        fontSize: 28,
        fontWeight: 600,
      }}
    >
      <Icon name="image" size={64} color={COLORS.accent} />
      Grafik belum ada
    </div>
  );
};

// Silhouettes of the client team, seen from behind. `nod` makes them nod along.
export const Audience = ({ nod = 0 }: { readonly nod?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const people = [
    { x: 160, s: 1.05 },
    { x: 520, s: 0.95 },
    { x: 900, s: 1.1 },
    { x: 1290, s: 1 },
    { x: 1680, s: 1.08 },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 300,
      }}
    >
      {people.map((p, i) => {
        const bob =
          nod * Math.max(0, Math.sin((frame / fps) * 5 + i * 1.3)) * 10;
        return (
          <div
            key={p.x}
            style={{
              position: "absolute",
              left: p.x,
              bottom: -120,
              translate: "-50% 0",
              scale: String(p.s),
              transformOrigin: "bottom center",
              filter: "blur(1.5px)",
            }}
          >
            <div
              style={{
                width: 150,
                height: 170,
                borderRadius: 75,
                background: "#2a2530",
                margin: "0 auto",
                translate: `0px ${bob}px`,
              }}
            />
            <div
              style={{
                width: 330,
                height: 170,
                borderRadius: "150px 150px 0 0",
                background: "#2a2530",
                marginTop: -16,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

// A phone gallery full of look-alike photos, scrolling fast.
export const GalleryPhone = ({ start }: { readonly start: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = Math.max(0, frame / fps - start);
  const tints = [
    "#e9e4ee",
    "#efe7e1",
    "#e4e7ee",
    "#ece9e4",
    "#f0e6ea",
    "#e6ebe6",
  ];
  return (
    <PhoneFrame screen={COLORS.surface}>
      <div style={{ padding: "76px 28px 18px" }}>
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: COLORS.ink,
          }}
        >
          Galeri
        </div>
        <div style={{ fontSize: 22, color: COLORS.muted, marginTop: 4 }}>
          3.482 foto
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "0 6px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            translate: `0px ${-interpolate(t, [0, 3], [0, 1600], { extrapolateRight: "clamp", easing: EASE_OUT })}px`,
          }}
        >
          {Array.from({ length: 72 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 168,
                borderRadius: 6,
                background: tints[(i * 7) % tints.length],
                display: "flex",
                alignItems: "flex-end",
                padding: 8,
                fontSize: 13,
                color: COLORS.muted,
              }}
            >
              IMG_{4700 + ((i * 37) % 300)}.jpg
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
};

export const DateDivider = ({
  children,
}: {
  readonly children: React.ReactNode;
}) => (
  <div
    style={{
      alignSelf: "center",
      background: "rgba(255,255,255,0.85)",
      borderRadius: 12,
      padding: "6px 16px",
      fontSize: 20,
      fontWeight: 600,
      color: COLORS.muted,
    }}
  >
    {children}
  </div>
);
