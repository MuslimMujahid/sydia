import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH } from "../../tiktok/parts";
import { Kitten, KosDoor, Paw } from "../kos";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.05; // the caption reads on the very first frame
// The kitten lands on "anak kucing", the question on "Boleh".
const CAT_AT = spokenAt("hook-rina", VO_AT, 2) - 0.15;
const ASK_AT = spokenAt("hook-rina", VO_AT, 7) - 0.2;

export const DOOR_SECONDS = VO_AT + LINES["hook-rina"].duration + 0.4;

const TOP = 600;
const DOOR_W = 580;
const DOOR_TOP = 86;
const CAT_W = 250;
// Door, mat and kitten stand on one line: the front edge of the doormat,
// measured from the top of the content box, so the drawing fills it instead of
// floating in the middle.
const FLOOR = DOOR_TOP + 548 * (DOOR_W / 440);

// Rina's question, as a thought bubble over the doorway.
const Wondering = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < ASK_AT) return null;
  return (
    <div style={{ position: "absolute", right: 0, top: 60, width: 420 }}>
      <Pop at={ASK_AT} style={{ transformOrigin: "right bottom" }}>
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 40,
            border: `2px solid ${COLORS.hairline}`,
            boxShadow: "rgba(23,20,25,0.14) 0 26px 50px -24px",
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1.22,
            letterSpacing: "-0.02em",
          }}
        >
          <Paw size={44} />
          <span>
            Boleh bawa
            <br />
            kucing?
          </span>
        </div>
      </Pop>
      {/* thought trail, shrinking down towards the kitten */}
      {[
        { s: 26, x: 86, y: 18 },
        { s: 16, x: 50, y: 50 },
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
            border: `2px solid ${COLORS.hairline}`,
          }}
        />
      ))}
    </div>
  );
};

export const Door = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

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
        <div style={{ position: "absolute", left: 0, top: DOOR_TOP }}>
          <KosDoor width={DOOR_W} />
        </div>
        {/* The kitten sits on the mat, clear of the potted plant on the right. */}
        {t >= CAT_AT ? (
          <div
            style={{
              position: "absolute",
              left: 196,
              top: FLOOR - CAT_W * 1.04,
            }}
          >
            <Pop at={CAT_AT} style={{ transformOrigin: "50% 100%" }}>
              <Kitten width={CAT_W} sway={Math.sin((t - CAT_AT) * 2.4)} />
            </Pop>
          </div>
        ) : null}
        <Wondering />
      </div>

      <Caption id="hook-rina" at={VO_AT} speaker="rina" />
      <Line id="hook-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
