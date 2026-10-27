import type React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import introTimings from "../voiceover-timings.json";
import { EASE_OUT, GRADIENT, VO_LEAD } from "../theme";

type Timings = Record<string, { words: { text: string; start: number }[] }>;

// Shows voiceover words as they are spoken, each rising into place.
// `highlight` lists word indices painted with the brand gradient. By default it
// reads the intro voiceover; pass `source` and `lead` for other clips.
export const SyncedWords = ({
  scene,
  from,
  to,
  highlight = [],
  source = introTimings,
  lead = VO_LEAD,
  style,
}: {
  readonly scene: string;
  readonly source?: Timings;
  readonly lead?: number;
  readonly from: number;
  readonly to: number;
  readonly highlight?: number[];
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = source[scene].words.slice(from, to + 1);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: "0.26em",
        ...style,
      }}
    >
      {words.map((word, i) => {
        const start = (lead + word.start - 0.05) * fps;
        const range = [start, start + 0.45 * fps];
        const opts = {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        } as const;
        const lit = highlight.includes(from + i);

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: interpolate(frame, range, [0, 1], opts),
              translate: interpolate(
                frame,
                range,
                ["0px 0.3em", "0px 0em"],
                opts,
              ),
              filter: `blur(${interpolate(frame, range, [8, 0], opts)}px)`,
              ...(lit
                ? {
                    backgroundImage: GRADIENT,
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                    paddingBottom: "0.08em",
                  }
                : null),
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};
