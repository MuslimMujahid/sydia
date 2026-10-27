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
import { Form, FORM_SECONDS } from "./scenes/Form";
import { Thanks, THANKS_SECONDS } from "./scenes/Thanks";
import { Upload, UPLOAD_SECONDS } from "./scenes/Upload";

const T = 10; // transition length in frames

export const KTP_FRAMES = (fps: number) =>
  [
    FORM_SECONDS,
    ASK_SECONDS,
    UPLOAD_SECONDS,
    THANKS_SECONDS,
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

export const SydiaTiktokKtp = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Formulir"
          durationInFrames={Math.round(FORM_SECONDS * fps)}
        >
          <Form />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Minta ke Sydia"
          durationInFrames={Math.round(ASK_SECONDS * fps)}
        >
          <Ask />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-left")} />
        <TransitionSeries.Sequence
          name="Unggah"
          durationInFrames={Math.round(UPLOAD_SECONDS * fps)}
        >
          <Upload />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...swipe("from-right")} />
        <TransitionSeries.Sequence
          name="Makasih"
          durationInFrames={Math.round(THANKS_SECONDS * fps)}
        >
          <Thanks />
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
