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
import { Clause, CLAUSE_SECONDS } from "./scenes/Clause";
import { Door, DOOR_SECONDS } from "./scenes/Door";
import { Draft, DRAFT_SECONDS } from "./scenes/Draft";
import { End, END_SECONDS } from "./scenes/End";

const T = 10; // transition length in frames

export const KOS_FRAMES = (fps: number) =>
  [
    DOOR_SECONDS,
    ASK_SECONDS,
    CLAUSE_SECONDS,
    DRAFT_SECONDS,
    END_SECONDS,
  ].reduce((sum, s) => sum + Math.round(s * fps), 0) -
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

export const SydiaTiktokKos = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Depan kos"
          durationInFrames={Math.round(DOOR_SECONDS * fps)}
        >
          <Door />
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
          name="Pasal 7"
          durationInFrames={Math.round(CLAUSE_SECONDS * fps)}
        >
          <Clause />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Draf pesan"
          durationInFrames={Math.round(DRAFT_SECONDS * fps)}
        >
          <Draft />
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
