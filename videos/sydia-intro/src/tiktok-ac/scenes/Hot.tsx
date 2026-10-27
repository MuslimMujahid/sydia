import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { AcUnit, HeatWaves } from "../ac";
import { RoomWall, SweatingRina } from "../room";
import { Drop } from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.05; // the caption reads on the very first frame
// The leak is called out on "netes", and the blank lands on "lupa namanya".
const DRIP_AT = spokenAt("hook-rina", VO_AT, 1) - 0.1;
const BLANK_AT = spokenAt("hook-rina", VO_AT, 8) - 0.2;

// The tail has to outlast the caption, which lingers 0.25 s past the last word,
// plus the 10-frame transition that eats into the end of the scene.
export const HOT_SECONDS = VO_AT + LINES["hook-rina"].duration + 0.7;

const TOP = 560;

// The leak, named so the hook reads on mute.
const DripLabel = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < DRIP_AT) return null;
  return (
    <div style={{ position: "absolute", left: 6, top: 196 }}>
      <Pop at={DRIP_AT} style={{ transformOrigin: "left center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 28px",
            borderRadius: 999,
            background: COLORS.surface,
            border: "4px solid #5fa8e0",
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            boxShadow: "rgba(95,168,224,0.35) 0 18px 40px -14px",
          }}
        >
          <Drop size={30} /> Netes
        </div>
      </Pop>
    </div>
  );
};

// Rina's blank: the name she cannot retrieve.
const Blank = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < BLANK_AT) return null;
  const pulse = 1 + 0.05 * Math.sin((t - BLANK_AT) * 6);
  // Above her head, clear of the AC casing on the left and her face below.
  return (
    <div style={{ position: "absolute", right: 0, top: 54, width: 322 }}>
      <Pop at={BLANK_AT} style={{ transformOrigin: "right bottom" }}>
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 36,
            border: `4px solid ${COLORS.accent}`,
            boxShadow: "rgba(240,102,148,0.3) 0 24px 48px -18px",
            padding: "22px 28px",
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            scale: String(pulse),
          }}
        >
          Tukang AC-nya
          <br />
          siapa, ya?
        </div>
      </Pop>
      {/* thought trail, shrinking down towards Rina */}
      {[
        { s: 24, x: 196, y: 16 },
        { s: 15, x: 164, y: 48 },
      ].map((d) => (
        <div
          key={d.s}
          style={{
            position: "absolute",
            left: d.x,
            top: `calc(100% + ${d.y}px)`,
            width: d.s,
            height: d.s,
            borderRadius: "50%",
            background: COLORS.surface,
            border: `3px solid ${COLORS.accent}`,
          }}
        />
      ))}
    </div>
  );
};

export const Hot = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

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
        <div style={{ position: "absolute", left: -20, top: 0, opacity: 0.75 }}>
          <RoomWall width={900} />
        </div>
        {/* heat shimmering across the whole room */}
        <div style={{ position: "absolute", left: 0, top: 150, opacity: 0.8 }}>
          <HeatWaves width={860} height={430} phase={t} count={8} />
        </div>
        <div style={{ position: "absolute", left: 24, top: 40 }}>
          <AcUnit width={520} drip={(t * 0.75) % 1} />
        </div>
        <div style={{ position: "absolute", left: 452, top: 356 }}>
          <SweatingRina
            width={330}
            fan={Math.sin(t * 7)}
            sweat={(t * 0.55) % 1}
          />
        </div>
        <DripLabel />
        <Blank />
      </div>

      <Caption id="hook-rina" at={VO_AT} speaker="rina" />
      <Line id="hook-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
