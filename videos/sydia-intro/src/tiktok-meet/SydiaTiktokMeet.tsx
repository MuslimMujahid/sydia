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
import { End, END_SECONDS } from "./scenes/End";
import { Hook, HOOK_SECONDS } from "./scenes/Hook";
import { Ready, READY_SECONDS } from "./scenes/Ready";
import { Reply, REPLY_SECONDS } from "./scenes/Reply";

const T = 10; // transition length in frames

export const MEET_FRAMES = (fps: number) =>
  [HOOK_SECONDS, ASK_SECONDS, REPLY_SECONDS, READY_SECONDS, END_SECONDS].reduce(
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

export const SydiaTiktokMeet = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Call dadakan"
          durationInFrames={Math.round(HOOK_SECONDS * fps)}
        >
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Minta jadwal"
          durationInFrames={Math.round(ASK_SECONDS * fps)}
        >
          <Ask />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Undangan terkirim"
          durationInFrames={Math.round(REPLY_SECONDS * fps)}
        >
          <Reply />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Link siap"
          durationInFrames={Math.round(READY_SECONDS * fps)}
        >
          <Ready />
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
