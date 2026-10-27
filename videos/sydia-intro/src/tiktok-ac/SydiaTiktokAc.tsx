import { Audio } from "@remotion/media";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import {
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Ask, ASK_SECONDS } from "./scenes/Ask";
import { Call, CALL_SECONDS } from "./scenes/Call";
import { Card, CARD_SECONDS } from "./scenes/Card";
import { End, END_SECONDS } from "./scenes/End";
import { Hot, HOT_SECONDS } from "./scenes/Hot";

const T = 10; // transition length in frames

export const AC_FRAMES = (fps: number) =>
  [HOT_SECONDS, ASK_SECONDS, CARD_SECONDS, CALL_SECONDS, END_SECONDS].reduce(
    (sum, s) => sum + Math.round(s * fps),
    0,
  ) -
  4 * T;

// Reuses the pengingat track; it runs 56 s, longer than this video.
const Music = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <Audio
      name="Music"
      src={staticFile("tiktok-pengingat/music.mp3")}
      volume={interpolate(
        frame,
        [0, 0.3 * fps, durationInFrames - 2 * fps, durationInFrames - 1],
        [0.1, 0.13, 0.13, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )}
    />
  );
};

const swipe = (direction: "from-right" | "from-left") => ({
  presentation: slide({ direction }),
  timing: springTiming({ config: { damping: 200 }, durationInFrames: T }),
});

export const SydiaTiktokAc = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Kamar panas"
          durationInFrames={Math.round(HOT_SECONDS * fps)}
        >
          <Hot />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Tanya Sydia"
          durationInFrames={Math.round(ASK_SECONDS * fps)}
        >
          <Ask />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Kartu kontak"
          durationInFrames={Math.round(CARD_SECONDS * fps)}
        >
          <Card />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Rina menelepon"
          durationInFrames={Math.round(CALL_SECONDS * fps)}
        >
          <Call />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Penutup"
          durationInFrames={Math.round(END_SECONDS * fps)}
        >
          <End />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Music />
    </>
  );
};
