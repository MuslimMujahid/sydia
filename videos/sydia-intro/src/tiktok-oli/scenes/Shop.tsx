import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Pop } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { Mechanic, Motorbike, ToolWall } from "../workshop";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.05; // the caption reads on the very first frame
// The mechanic's question lands as a speech bubble, then Rina blanks on "lupa".
const ASK_AT = spokenAt("hook-rina", VO_AT, 2) - 0.2;
const BLANK_AT = spokenAt("hook-rina", VO_AT, 6) - 0.1;

export const SHOP_SECONDS = VO_AT + LINES["hook-rina"].duration + 0.35;

const TOP = 600;
// Everything in the workshop stands on one floor line, measured from the top of
// the content box, so the drawing fills it instead of floating in the middle.
const FLOOR = 800;

// What the mechanic actually asks, so the hook reads even on mute.
const Question = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < ASK_AT) return null;
  return (
    <div style={{ position: "absolute", left: 24, top: 36, width: 620 }}>
      <Pop at={ASK_AT} style={{ transformOrigin: "left bottom" }}>
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 34,
            border: `2px solid ${COLORS.hairline}`,
            boxShadow: "rgba(23,20,25,0.14) 0 26px 50px -24px",
            padding: "26px 32px",
            fontSize: 40,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            position: "relative",
          }}
        >
          Terakhir ganti oli kapan, Mbak?
          {/* tail pointing down at the mechanic */}
          <div
            style={{
              position: "absolute",
              left: 58,
              bottom: -22,
              width: 40,
              height: 26,
              background: COLORS.surface,
              borderRight: `2px solid ${COLORS.hairline}`,
              borderBottom: `2px solid ${COLORS.hairline}`,
              borderBottomRightRadius: 8,
              rotate: "34deg",
            }}
          />
        </div>
      </Pop>
    </div>
  );
};

// Rina's blank: three dots where an answer should be.
const Blank = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < BLANK_AT) return null;
  const pulse = 1 + 0.07 * Math.sin((t - BLANK_AT) * 6);
  return (
    <div
      style={{
        position: "absolute",
        right: 18,
        top: 206,
        scale: String(pulse),
      }}
    >
      <Pop at={BLANK_AT}>
        <div
          style={{
            width: 166,
            height: 112,
            borderRadius: 54,
            background: COLORS.surface,
            border: `4px solid ${COLORS.accent}`,
            boxShadow: "rgba(240,102,148,0.32) 0 18px 40px -12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: COLORS.accent,
                opacity:
                  0.3 + 0.6 * Math.max(0, Math.sin((t - BLANK_AT) * 7 - i)),
              }}
            />
          ))}
        </div>
      </Pop>
    </div>
  );
};

export const Shop = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // The mechanic leans back from the engine as he asks.
  const lean = interpolate(t, [ASK_AT, ASK_AT + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.15} />
      {/* No entrance: a TikTok hook has to read on the very first frame. */}
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          top: TOP,
          width: SAFE_WIDTH,
          height: SAFE.bottom - TOP,
        }}
      >
        <div
          style={{ position: "absolute", left: -80, top: 170, opacity: 0.5 }}
        >
          <ToolWall width={1060} />
        </div>
        <div style={{ position: "absolute", left: 108, top: FLOOR - 471 }}>
          <Motorbike width={880} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: FLOOR - 389,
            rotate: `${-4 * lean}deg`,
            transformOrigin: "50% 100%",
          }}
        >
          <Mechanic width={320} />
        </div>
        <Question />
        <Blank />
      </div>

      <Caption id="hook-rina" at={VO_AT} speaker="rina" />
      <Line id="hook-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
