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
import { Chat, CHAT_SECONDS } from "./scenes/Chat";
import { End, END_SECONDS } from "./scenes/End";
import { Hook, HOOK_SECONDS } from "./scenes/Hook";

const T = 10; // transition length in frames; TikTok cuts stay snappy

export const TIKTOK_FRAMES = (fps: number) =>
  [HOOK_SECONDS, CHAT_SECONDS, END_SECONDS].reduce(
    (sum, s) => sum + Math.round(s * fps),
    0,
  ) -
  2 * T;

const Music = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <Audio
      name="Music"
      src={staticFile("tiktok/music.mp3")}
      volume={interpolate(
        frame,
        [0, 0.3 * fps, durationInFrames - 2 * fps, durationInFrames - 1],
        [0.1, 0.14, 0.14, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )}
    />
  );
};

export const SydiaTiktokDeadline = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Deadline numpuk"
          durationInFrames={Math.round(HOOK_SECONDS * fps)}
        >
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Chat Sydia"
          durationInFrames={Math.round(CHAT_SECONDS * fps)}
        >
          <Chat />
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
