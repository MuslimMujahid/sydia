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
import { Flashback, FLASHBACK_SECONDS } from "./scenes/Flashback";
import { Saved, SAVED_SECONDS } from "./scenes/Saved";
import { Today, TODAY_SECONDS } from "./scenes/Today";

const T = 14; // transition length in frames

export const USECASE_FRAMES = (fps: number) =>
  [
    FLASHBACK_SECONDS,
    TODAY_SECONDS,
    ASK_SECONDS,
    SAVED_SECONDS,
    END_SECONDS,
  ].reduce((sum, s) => sum + Math.round(s * fps), 0) -
  4 * T;

const Music = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <Audio
      name="Music"
      src={staticFile("music/bed.mp3")}
      volume={interpolate(
        frame,
        [0, 1 * fps, durationInFrames - 2.5 * fps, durationInFrames - 1],
        [0, 0.11, 0.11, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )}
    />
  );
};

export const SydiaUsecase = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Satu bulan lalu"
          durationInFrames={Math.round(FLASHBACK_SECONDS * fps)}
        >
          <Flashback />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Hari ini"
          durationInFrames={Math.round(TODAY_SECONDS * fps)}
        >
          <Today />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Tanya Sydia"
          durationInFrames={Math.round(ASK_SECONDS * fps)}
        >
          <Ask />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Beres"
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
