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
import { End, END_SECONDS } from "./scenes/End";
import { Pile, PILE_SECONDS } from "./scenes/Pile";
import { Read, READ_SECONDS } from "./scenes/Read";
import { Saved, SAVED_SECONDS } from "./scenes/Saved";
import { Send, SEND_SECONDS } from "./scenes/Send";

const T = 10; // transition length in frames

export const UNDANGAN_FRAMES = (fps: number) =>
  [PILE_SECONDS, SEND_SECONDS, READ_SECONDS, SAVED_SECONDS, END_SECONDS].reduce(
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

export const SydiaTiktokUndangan = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Undangan numpuk"
          durationInFrames={Math.round(PILE_SECONDS * fps)}
        >
          <Pile />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Kirim foto"
          durationInFrames={Math.round(SEND_SECONDS * fps)}
        >
          <Send />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Sydia baca undangan"
          durationInFrames={Math.round(READ_SECONDS * fps)}
        >
          <Read />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Masuk kalender"
          durationInFrames={Math.round(SAVED_SECONDS * fps)}
        >
          <Saved />
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
