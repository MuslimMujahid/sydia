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
import { ClientChat, DeskClock, Laptop } from "../desk";
import { DeskSurface, PanickedRina } from "../rina";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.05; // the caption reads on the very first frame
// Pak Budi's message lands on "minta call", the clock is called out on
// "Mepet", and the missing link follows on "link Meet belum ada".
const MSG_AT = spokenAt("hook-rina", VO_AT, 3) - 0.2;
const CLOCK_AT = spokenAt("hook-rina", VO_AT, 7) - 0.2;
const BLANK_AT = spokenAt("hook-rina", VO_AT, 9) - 0.15;

// The tail outlasts the caption, which lingers 0.25 s past the last word, plus
// the 10-frame transition that eats into the end of the scene.
export const HOOK_SECONDS = VO_AT + LINES["hook-rina"].duration + 0.7;

const TOP = 580;

// What Rina has and does not have: the ask is in, the link is not.
const Missing = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < BLANK_AT) return null;
  const pulse = 1 + 0.04 * Math.sin((t - BLANK_AT) * 6);
  return (
    <div style={{ position: "absolute", left: 0, top: 672, width: 660 }}>
      <Pop at={BLANK_AT} style={{ transformOrigin: "left top" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 20,
            background: COLORS.surface,
            borderRadius: 34,
            border: `4px solid ${COLORS.accent}`,
            boxShadow: "rgba(240,102,148,0.3) 0 24px 48px -18px",
            padding: "22px 34px",
            scale: String(pulse),
          }}
        >
          <div
            style={{
              fontSize: 54,
              fontWeight: 800,
              color: COLORS.accent,
              lineHeight: 1,
            }}
          >
            ?
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            Link Meet
            <br />
            belum ada
          </div>
        </div>
      </Pop>
    </div>
  );
};

export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // She flinches when the message arrives, then settles.
  const jolt =
    t < MSG_AT
      ? 0
      : Math.sin((t - MSG_AT) * 13) * Math.exp(-(t - MSG_AT) * 1.6);
  const clockPulse = interpolate(
    t,
    [CLOCK_AT, CLOCK_AT + 0.22, CLOCK_AT + 0.75],
    [1, 1.09, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.3} />
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
        <div style={{ position: "absolute", left: 0, top: 560 }}>
          <DeskSurface width={860} />
        </div>
        <div style={{ position: "absolute", left: 500, top: 250 }}>
          <PanickedRina width={300} jolt={jolt} />
        </div>
        <div style={{ position: "absolute", left: 0, top: 262 }}>
          <Laptop width={540}>
            <ClientChat
              message="Bu Rina, bisa call jam 2 siang ini?"
              time="13.40"
              shown={t >= MSG_AT}
            />
          </Laptop>
        </div>
        <div
          style={{
            position: "absolute",
            left: 634,
            top: 0,
            scale: String(clockPulse),
          }}
        >
          <DeskClock hour={13} minute={40} label="20 menit lagi" />
        </div>
        <Missing />
      </div>

      <Caption id="hook-rina" at={VO_AT} speaker="rina" />
      <Line id="hook-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
