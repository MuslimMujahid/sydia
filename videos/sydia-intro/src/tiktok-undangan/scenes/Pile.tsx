import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop } from "../../components/Anim";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { InviteCard, OTHERS, SARAH } from "../invite";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.05; // the caption reads on the very first frame
// Sarah's card slides out of the pile on her name, and the dates go unreadable
// when Rina asks which day it was.
const SARAH_AT = spokenAt("hook-rina", VO_AT, 2);
const DATE_AT = spokenAt("hook-rina", VO_AT, 7);

export const PILE_SECONDS = VO_AT + LINES["hook-rina"].duration + 0.7;

const CARD_W = 356;
const LEFT = (SAFE_WIDTH - CARD_W) / 2;
const TOP = 200;

// The other invitations, fanned behind Sarah's from a single pivot.
const BACK_ANGLES = [-17, -8, 10];

// The question mark that lands on the date Rina cannot remember.
const Mark = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < DATE_AT) return null;
  const pulse = 1 + 0.08 * Math.sin((t - DATE_AT) * 6);
  return (
    <div
      style={{
        position: "absolute",
        left: LEFT + CARD_W - 54,
        top: TOP + 346,
        scale: String(pulse),
      }}
    >
      <Pop at={DATE_AT}>
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: 52,
            background: COLORS.surface,
            border: `4px solid ${COLORS.accent}`,
            boxShadow: "rgba(240,102,148,0.32) 0 18px 40px -12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 58,
            fontWeight: 800,
            color: COLORS.accent,
          }}
        >
          ?
        </div>
      </Pop>
    </div>
  );
};

export const Pile = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lift = interpolate(t, [SARAH_AT, SARAH_AT + 0.55], [0, 1], {
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
          top: 560,
          width: SAFE_WIDTH,
          height: SAFE.bottom - 560,
        }}
      >
        {OTHERS.map((invite, i) => (
          <div
            key={invite.bride}
            style={{
              position: "absolute",
              left: LEFT,
              top: TOP,
              transformOrigin: "50% 135%",
              rotate: `${BACK_ANGLES[i] * (1 + 0.28 * lift)}deg`,
              scale: "0.95",
            }}
          >
            <InviteCard invite={invite} width={CARD_W} blurDate />
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: LEFT,
            top: TOP,
            transformOrigin: "50% 135%",
            rotate: `${2 - 3.5 * lift}deg`,
            translate: `0px ${-34 * lift}px`,
            scale: String(1 + 0.06 * lift),
          }}
        >
          <InviteCard invite={SARAH} width={CARD_W} blurDate={t >= DATE_AT} />
        </div>
        <Mark />
      </div>

      <Caption id="hook-rina" at={VO_AT} speaker="rina" />
      <Line id="hook-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
