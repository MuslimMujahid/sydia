import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT } from "../../theme";
import { SAFE_WIDTH } from "../../tiktok/parts";
import { FormCard, UploadSlot } from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const HOOK_AT = 0.05; // the caption shows from frame one
const GALLERY_AT = HOOK_AT + LINES["hook-rina"].duration + 0.25;
const INGAT_AT = GALLERY_AT + LINES["gallery-rina"].duration + 0.3;
const CLOSE_AT = spokenAt("ingat-rina", INGAT_AT, 2);

export const FORM_SECONDS = INGAT_AT + LINES["ingat-rina"].duration + 0.5;

// Soft pastel pairs standing in for a camera roll of selfies, food and screenshots.
const TONES = [
  ["#ffd9c2", "#ffb39a"],
  ["#d9e4ff", "#b7c6f5"],
  ["#e7f3d9", "#c3e0a8"],
  ["#f6dcf0", "#e3b5dc"],
  ["#fff1c9", "#ffd98a"],
  ["#dff1f2", "#a9d8db"],
  ["#ece7f9", "#cdc0f0"],
  ["#f3e3d6", "#d9bda5"],
];
const COLS = 3;
const ROWS = 34;
const GAP = 8;
// The card has a 1.5px border on each side, so the sheet is 3px narrower.
const TILE = Math.floor((SAFE_WIDTH - 3 - GAP * (COLS - 1)) / COLS);

const Tile = ({ i }: { readonly i: number }) => {
  const [a, b] = TONES[(i * 5 + Math.floor(i / 3)) % TONES.length];
  const kind = (i * 7) % 5;
  return (
    <div
      style={{
        width: TILE,
        height: TILE,
        background: `linear-gradient(${(i * 47) % 360}deg, ${a}, ${b})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {kind === 0 ? (
        // A screenshot: white page with text lines.
        <div
          style={{
            position: "absolute",
            inset: "18% 22%",
            borderRadius: 14,
            background: "rgba(255,255,255,0.85)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {[80, 60, 70, 40].map((w, k) => (
            <div
              key={k}
              style={{
                width: `${w}%`,
                height: 8,
                borderRadius: 4,
                background: "rgba(23,20,25,0.15)",
              }}
            />
          ))}
        </div>
      ) : kind === 1 ? (
        // A landscape: sun over a hill.
        <>
          <div
            style={{
              position: "absolute",
              right: "22%",
              top: "20%",
              width: 44,
              height: 44,
              borderRadius: 22,
              background: "rgba(255,255,255,0.75)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "-20%",
              right: "-20%",
              bottom: "-35%",
              height: "70%",
              borderRadius: "50%",
              background: "rgba(23,20,25,0.12)",
            }}
          />
        </>
      ) : kind === 2 ? (
        // A selfie: head and shoulders.
        <>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "26%",
              width: 74,
              height: 74,
              marginLeft: -37,
              borderRadius: 37,
              background: "rgba(255,255,255,0.6)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "-18%",
              width: 170,
              height: 130,
              marginLeft: -85,
              borderRadius: 85,
              background: "rgba(255,255,255,0.6)",
            }}
          />
        </>
      ) : null}
    </div>
  );
};

// The phone's photo picker, scrolled fast through an endless camera roll.
const GallerySheet = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const open = interpolate(
    t,
    [GALLERY_AT - 0.1, GALLERY_AT + 0.35, CLOSE_AT, CLOSE_AT + 0.4],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
  );
  if (open <= 0) return null;
  const scrollRange = [GALLERY_AT + 0.4, INGAT_AT + 0.3];
  const scroll = interpolate(t, scrollRange, [0, (ROWS - 4) * (TILE + GAP)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.45, 0, 0.25, 1),
  });
  // Blur the tiles a little while they fly past.
  const speed = Math.abs(
    interpolate(t + 1 / fps, scrollRange, [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.45, 0, 0.25, 1),
    }) -
      interpolate(t, scrollRange, [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.45, 0, 0.25, 1),
      }),
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(23,20,25,0.28)",
          opacity: open,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 130,
          bottom: 0,
          translate: `0px ${(1 - open) * 840}px`,
          background: COLORS.surface,
          borderRadius: "40px 40px 0 0",
          boxShadow: "rgba(23,20,25,0.18) 0 -20px 60px -10px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            alignSelf: "center",
            width: 90,
            height: 9,
            borderRadius: 5,
            background: "rgba(23,20,25,0.15)",
            marginTop: 18,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "22px 36px 24px",
          }}
        >
          <div
            style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}
          >
            Galeri
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: COLORS.muted }}>
            12.480 foto
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: GAP,
              translate: `0px ${-scroll}px`,
              filter: `blur(${Math.min(4, speed * 180)}px)`,
            }}
          >
            {Array.from({ length: COLS * ROWS }).map((_, i) => (
              <Tile key={i} i={i} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export const Form = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // Each upload field lights up as Rina names it.
  const glow = (word: number) =>
    interpolate(
      t,
      [
        spokenAt("hook-rina", HOOK_AT, word) - 0.05,
        spokenAt("hook-rina", HOOK_AT, word) + 0.35,
      ],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_IN_OUT,
      },
    );
  // A tap on the KTP field opens the gallery.
  const tap = interpolate(
    t,
    [GALLERY_AT - 0.3, GALLERY_AT - 0.1, GALLERY_AT + 0.1],
    [0, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.1} />
      {/* No entrance: a TikTok hook has to read on the very first frame. */}
      <FormCard
        ktp={<UploadSlot label="Foto KTP" glow={glow(4)} />}
        kk={<UploadSlot label="Foto KK" glow={glow(6)} />}
        overlay={
          <>
            <div
              style={{
                position: "absolute",
                // Centre of the KTP field.
                left: 174,
                top: 461,
                width: 110,
                height: 110,
                borderRadius: 55,
                background: "rgba(23,20,25,0.18)",
                opacity: tap,
                scale: String(0.6 + 0.4 * tap),
              }}
            />
            <GallerySheet />
          </>
        }
      />

      <Caption id="hook-rina" at={HOOK_AT} speaker="rina" />
      <Caption id="gallery-rina" at={GALLERY_AT} speaker="rina" />
      <Caption id="ingat-rina" at={INGAT_AT} speaker="rina" />

      <Line id="hook-rina" at={HOOK_AT} />
      <Line id="gallery-rina" at={GALLERY_AT} />
      <Line id="ingat-rina" at={INGAT_AT} />
    </AbsoluteFill>
  );
};
