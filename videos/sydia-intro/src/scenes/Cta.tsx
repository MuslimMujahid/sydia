import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop, Rise } from "../components/Anim";
import { SyncedWords } from "../components/SyncedWords";
import { Logo } from "../components/Ui";
import {
  COLORS,
  EASE_IN_OUT,
  EASE_OUT,
  FONT,
  GRADIENT,
  wordAt,
} from "../theme";

export const CLICK_AT = 6.5;

const Cursor = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const moveStart = (CLICK_AT - 1.1) * fps;
  const press = interpolate(
    frame,
    [CLICK_AT * fps - 3, CLICK_AT * fps, CLICK_AT * fps + 5],
    [1, 0.82, 1],
    clamp,
  );

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        translate: interpolate(
          frame,
          [moveStart, CLICK_AT * fps - 3],
          ["520px 420px", "110px 170px"],
          {
            ...clamp,
            easing: EASE_IN_OUT,
          },
        ),
        opacity: interpolate(frame, [moveStart, moveStart + 6], [0, 1], clamp),
        scale: String(press),
      }}
    >
      <svg width="54" height="54" viewBox="0 0 24 24">
        <path
          d="M5 3l14 8-6.2 1.6L10 19z"
          fill={COLORS.ink}
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export const Cta = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const clickFrame = CLICK_AT * fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora
        intensity={interpolate(
          frame,
          [clickFrame, clickFrame + 1.2 * fps],
          [1, 1.9],
          {
            ...clamp,
            easing: EASE_OUT,
          },
        )}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          paddingBottom: 40,
        }}
      >
        <Pop at={0.15}>
          <Logo size={190} />
        </Pop>
        <SyncedWords
          scene="cta"
          from={0}
          to={3}
          highlight={[3]}
          style={{
            fontSize: 130,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            marginTop: 40,
            justifyContent: "center",
          }}
        />
        <Rise
          at={wordAt("cta", 4) - 0.1}
          distance={40}
          style={{ marginTop: 56 }}
        >
          <div
            style={{
              backgroundImage: GRADIENT,
              color: "#fff",
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              padding: "30px 64px",
              borderRadius: 999,
              boxShadow:
                "rgba(240,102,148,0.35) 0 24px 50px -18px, rgba(140,92,255,0.28) 0 12px 30px -12px",
              scale: String(
                interpolate(
                  frame,
                  [clickFrame - 3, clickFrame, clickFrame + 8],
                  [1, 0.95, 1],
                  {
                    ...clamp,
                    easing: EASE_OUT,
                  },
                ),
              ),
            }}
          >
            Coba gratis 7 hari
          </div>
        </Rise>
        <Rise
          at={wordAt("cta", 8) - 0.1}
          distance={20}
          style={{ marginTop: 34 }}
        >
          <div style={{ fontSize: 40, color: COLORS.muted, fontWeight: 500 }}>
            Tanpa kartu, tanpa pembayaran.
          </div>
        </Rise>
      </AbsoluteFill>
      <Cursor />
    </AbsoluteFill>
  );
};
