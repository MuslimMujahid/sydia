import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Pop, Rise } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { Avatar } from "../parts";
import { CallButton, ContactCard, JOKO, Tap } from "../contact";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.35;
// Rina taps the saved number on "ini dia", then the call screen comes up as she
// says she is calling. Sydia never dials: this is Rina's own phone.
const TAP_AT = spokenAt("call-rina", VO_AT, 1) + 0.05;
const DIAL_AT = spokenAt("call-rina", VO_AT, 4) - 0.1;

export const CALL_SECONDS = VO_AT + LINES["call-rina"].duration + 1.5;

const TOP = 600;

// The outgoing call on Rina's phone: who she is calling and the number she got.
const Dialing = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < DIAL_AT) return null;
  // The handset shivers while it rings.
  const ring = Math.sin((t - DIAL_AT) * 13) * 4 * (t - DIAL_AT < 1.2 ? 1 : 0.5);
  return (
    <Pop at={DIAL_AT}>
      <div
        style={{
          width: 600,
          borderRadius: 44,
          background: "#1b1a22",
          padding: "52px 44px 44px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxShadow: "rgba(23,20,25,0.4) 0 60px 110px -40px",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.1em",
          }}
        >
          MEMANGGIL
        </div>
        <div style={{ marginTop: 28, rotate: `${ring}deg` }}>
          <Avatar initials={JOKO.initials} size={132} />
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 52,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.03em",
          }}
        >
          {JOKO.name}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 32,
            fontWeight: 600,
            color: "rgba(255,255,255,0.6)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {JOKO.phone}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 27,
            fontWeight: 600,
            color: "#8ccbfb",
          }}
        >
          {JOKO.alias}
        </div>
        <div style={{ marginTop: 36, display: "flex", gap: 24 }}>
          {/* Ringing bars, so the screen is alive while it dials. */}
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                background: "#1fa855",
                opacity:
                  0.25 + 0.75 * Math.max(0, Math.sin((t - DIAL_AT) * 7 - i)),
              }}
            />
          ))}
        </div>
      </div>
    </Pop>
  );
};

export const Call = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const press = interpolate(
    t,
    [TAP_AT, TAP_AT + 0.09, TAP_AT + 0.24],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const ripple = interpolate(t, [TAP_AT, TAP_AT + 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          top: TOP,
          width: SAFE_WIDTH,
          height: SAFE.bottom - TOP,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {t < DIAL_AT ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ContactCard
              nameAt={0}
              aliasAt={0}
              phoneAt={0}
              noteAt={0}
              press={press}
            />
            {/* The button is on Rina's own phone and she presses it herself. */}
            <Rise
              at={0.1}
              distance={18}
              blur={false}
              style={{ marginTop: 44, position: "relative" }}
            >
              <CallButton pressed={press} />
              <div style={{ position: "absolute", left: "50%", top: "50%" }}>
                <Tap progress={ripple} size={210} />
              </div>
            </Rise>
          </div>
        ) : (
          <Dialing />
        )}
      </div>

      <Caption id="call-rina" at={VO_AT} speaker="rina" />
      <Line id="call-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
