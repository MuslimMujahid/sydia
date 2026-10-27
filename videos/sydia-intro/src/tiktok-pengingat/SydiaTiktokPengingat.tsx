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
import { Done, DONE_SECONDS } from "./scenes/Done";
import { End, END_SECONDS } from "./scenes/End";
import { Lock, LOCK_SECONDS } from "./scenes/Lock";
import { Record, RECORD_SECONDS } from "./scenes/Record";

const T = 10; // transition length in frames

export const PENGINGAT_FRAMES = (fps: number) =>
  [RECORD_SECONDS, LOCK_SECONDS, DONE_SECONDS, END_SECONDS].reduce(
    (sum, s) => sum + Math.round(s * fps),
    0,
  ) -
  3 * T;

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

export const SydiaTiktokPengingat = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Voice note"
          durationInFrames={Math.round(RECORD_SECONDS * fps)}
        >
          <Record />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Jam 19.00"
          durationInFrames={Math.round(LOCK_SECONDS * fps)}
        >
          <Lock />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Beres"
          durationInFrames={Math.round(DONE_SECONDS * fps)}
        >
          <Done />
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
