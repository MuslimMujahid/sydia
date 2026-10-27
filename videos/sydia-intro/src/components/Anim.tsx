import type React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_OUT } from "../theme";

type RiseProps = {
  readonly at: number; // seconds into the parent sequence
  readonly duration?: number;
  readonly distance?: number;
  readonly blur?: boolean;
  readonly style?: React.CSSProperties;
  readonly children: React.ReactNode;
};

// Fades and lifts its children into place, the house entrance for text and cards.
export const Rise = ({
  at,
  duration = 0.6,
  distance = 40,
  blur = true,
  style,
  children,
}: RiseProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const range = [at * fps, (at + duration) * fps];
  const opts = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  } as const;

  return (
    <div
      style={{
        opacity: interpolate(frame, range, [0, 1], opts),
        translate: interpolate(
          frame,
          range,
          [`0px ${distance}px`, "0px 0px"],
          opts,
        ),
        filter: blur
          ? `blur(${interpolate(frame, range, [12, 0], opts)}px)`
          : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type PopProps = {
  readonly at: number;
  readonly style?: React.CSSProperties;
  readonly children: React.ReactNode;
};

// Springy scale-in for bubbles, pills and icons.
export const Pop = ({ at, style, children }: PopProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame - at * fps) / fps;

  // Damped spring overshoot, computed in closed form so it stays deterministic.
  const scale = t <= 0 ? 0 : 1 - Math.exp(-9 * t) * Math.cos(14 * t);

  return (
    <div
      style={{
        scale: String(Math.max(0, scale)),
        opacity: interpolate(t, [0, 0.12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Reveals text letter by letter, like someone typing.
export const Typewriter = ({
  text,
  at,
  cps = 22,
  caret = true,
  style,
}: {
  readonly text: string;
  readonly at: number;
  readonly cps?: number;
  readonly caret?: boolean;
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = Math.max(0, Math.floor(((frame - at * fps) / fps) * cps));
  const done = shown >= text.length;
  const blink = Math.floor(frame / (fps / 2)) % 2 === 0;

  return (
    <span style={style}>
      {text.slice(0, shown)}
      {caret && (!done || blink) && frame >= at * fps ? (
        <span
          style={{
            display: "inline-block",
            width: "0.06em",
            height: "1em",
            marginLeft: "0.04em",
            verticalAlign: "-0.12em",
            background: "currentColor",
            opacity: 0.8,
          }}
        />
      ) : null}
    </span>
  );
};
