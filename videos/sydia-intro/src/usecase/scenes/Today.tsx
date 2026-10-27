import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Rise } from "../../components/Anim";
import { SyncedWords } from "../../components/SyncedWords";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import {
  Audience,
  EmptySlot,
  GalleryPhone,
  Line,
  LINES,
  Slide,
  spokenAt,
} from "../parts";

const RINA_AT = 1.1;
const GALLERY_AT = spokenAt("today-rina", RINA_AT, 4) - 0.2;

export const TODAY_SECONDS = RINA_AT + LINES["today-rina"].duration + 1.4;

export const Today = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const line = {
    fontSize: 64,
    fontWeight: 700,
    letterSpacing: "-0.035em",
  } as const;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={0.6} />

      <div style={{ position: "absolute", left: 140, top: 70 }}>
        <Rise at={0.15}>
          <div style={{ fontSize: 34, fontWeight: 600, color: COLORS.muted }}>
            Hari ini, presentasi ke klien
          </div>
        </Rise>
        <SyncedWords
          scene="today-rina"
          source={LINES}
          lead={RINA_AT}
          from={0}
          to={3}
          highlight={[3]}
          style={{ ...line, marginTop: 14 }}
        />
        <SyncedWords
          scene="today-rina"
          source={LINES}
          lead={RINA_AT}
          from={4}
          to={7}
          style={line}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 140,
          top: 300,
          scale: interpolate(frame, [0, TODAY_SECONDS * fps], [0.8, 0.83]),
          transformOrigin: "left top",
        }}
      >
        <Slide chart={<EmptySlot />} />
      </div>

      <Audience />

      <div
        style={{
          position: "absolute",
          right: 170,
          top: 60,
          scale: "0.86",
          transformOrigin: "right top",
          translate: interpolate(
            frame,
            [GALLERY_AT * fps, (GALLERY_AT + 0.7) * fps],
            ["0px 1200px", "0px 0px"],
            {
              ...clamp,
              easing: EASE_OUT,
            },
          ),
          rotate: `${interpolate(frame, [GALLERY_AT * fps, (GALLERY_AT + 0.8) * fps], [8, 2], clamp)}deg`,
        }}
      >
        <GalleryPhone start={GALLERY_AT + 0.4} />
      </div>

      <Line id="today-rina" at={RINA_AT} />
    </AbsoluteFill>
  );
};
