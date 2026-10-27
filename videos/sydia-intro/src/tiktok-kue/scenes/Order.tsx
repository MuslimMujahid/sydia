import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { CakeItem, OrderCard } from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const HOOK_AT = 0.05; // the caption shows from frame one
const RAGU_AT = HOOK_AT + LINES["hook-rina"].duration + 0.3;
// Rina reaches for Pesan, then stops when she says "alergi".
const TAP_AT = spokenAt("ragu-rina", RAGU_AT, 1);
const DOUBT_AT = spokenAt("ragu-rina", RAGU_AT, 4);

export const ORDER_SECONDS = RAGU_AT + LINES["ragu-rina"].duration + 0.5;

// The thought that stops the order: a soft "?" over the peanut topping.
const Doubt = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < DOUBT_AT - 0.1) return null;
  const inOut = interpolate(t, [DOUBT_AT - 0.1, DOUBT_AT + 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const pulse = 1 + 0.07 * Math.sin((t - DOUBT_AT) * 5.5);

  return (
    <div
      style={{
        position: "absolute",
        left: 148,
        top: -8,
        width: 96,
        height: 96,
        borderRadius: 48,
        background: COLORS.surface,
        border: `3px solid ${COLORS.accent}`,
        boxShadow: "rgba(240,102,148,0.3) 0 16px 36px -12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 54,
        fontWeight: 800,
        color: COLORS.accent,
        opacity: inOut,
        scale: String((0.6 + 0.4 * inOut) * pulse),
      }}
    >
      ?
    </div>
  );
};

export const Order = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // A tap that never lands: the ring grows toward Pesan, then lets go.
  const tap = interpolate(
    t,
    [TAP_AT, TAP_AT + 0.35, DOUBT_AT - 0.15, DOUBT_AT + 0.15],
    [0, 1, 0.9, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.1} />
      {/* No entrance: a TikTok hook has to read on the very first frame. */}
      <OrderCard
        total="Rp 185.000"
        ready={t < DOUBT_AT}
        pressed={tap * 0.5}
        overlay={
          <div
            style={{
              position: "absolute",
              left: 375,
              top: 753,
              width: 110,
              height: 110,
              borderRadius: 55,
              background: "rgba(23,20,25,0.18)",
              opacity: tap,
              scale: String(0.6 + 0.4 * tap),
            }}
          />
        }
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <CakeItem kind="brownies" name="Brownies Kacang" selected />
          <Doubt />
        </div>
      </OrderCard>

      <Caption id="hook-rina" at={HOOK_AT} speaker="rina" />
      <Caption id="ragu-rina" at={RAGU_AT} speaker="rina" />

      <Line id="hook-rina" at={HOOK_AT} />
      <Line id="ragu-rina" at={RAGU_AT} />
    </AbsoluteFill>
  );
};
