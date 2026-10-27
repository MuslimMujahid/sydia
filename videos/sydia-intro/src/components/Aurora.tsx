import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../theme";

const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

type Blob = {
  color: string;
  x: number;
  y: number;
  size: number;
  speed: number;
};

// Bone-white canvas with slow drifting aurora glows and a fine grain.
export const Aurora = ({
  intensity = 1,
  blobs = [
    { color: COLORS.amber, x: 8, y: 92, size: 900, speed: 0.6 },
    { color: COLORS.violet, x: 94, y: 6, size: 1000, speed: 0.45 },
    { color: COLORS.coral, x: 70, y: 105, size: 700, speed: 0.8 },
  ],
}: {
  readonly intensity?: number;
  readonly blobs?: Blob[];
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill
      style={{ backgroundColor: COLORS.canvas, overflow: "hidden" }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${b.x + Math.sin(t * b.speed + i) * 3}%`,
            top: `${b.y + Math.cos(t * b.speed * 0.8 + i) * 3}%`,
            width: b.size,
            height: b.size,
            translate: "-50% -50%",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${b.color} 0%, transparent 65%)`,
            opacity: 0.22 * intensity,
            filter: "blur(40px)",
          }}
        />
      ))}
      <AbsoluteFill
        style={{
          backgroundImage: NOISE,
          opacity: 0.08,
          mixBlendMode: "multiply",
        }}
      />
    </AbsoluteFill>
  );
};
