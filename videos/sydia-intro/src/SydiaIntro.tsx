import { Audio } from "@remotion/media";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Actions } from "./scenes/Actions";
import { Briefing } from "./scenes/Briefing";
import { Chat } from "./scenes/Chat";
import { CLICK_AT, Cta } from "./scenes/Cta";
import { Dashboard } from "./scenes/Dashboard";
import { Hook } from "./scenes/Hook";
import { Intro } from "./scenes/Intro";
import { Media } from "./scenes/Media";
import { Memory } from "./scenes/Memory";
import { VO_LEAD } from "./theme";

const T = 14; // transition length in frames

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
        [0, 0.16, 0.16, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )}
    />
  );
};

// Voiceover for one scene, starting after the incoming transition.
const Vo = ({ id }: { readonly id: string }) => {
  const { fps } = useVideoConfig();
  return (
    <Audio
      name={`VO ${id}`}
      src={staticFile(`voiceover/${id}.mp3`)}
      from={Math.round(VO_LEAD * fps)}
    />
  );
};

const Whoosh = () => (
  <Audio name="Whoosh" src="https://remotion.media/whoosh.wav" volume={0.18} />
);

export const SydiaIntro = () => {
  const { fps } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Hook"
          durationInFrames={Math.round(9.6 * fps)}
        >
          <Hook />
          <Vo id="hook" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Intro"
          durationInFrames={Math.round(7.6 * fps)}
        >
          <Intro />
          <Vo id="intro" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Chat"
          durationInFrames={Math.round(7 * fps)}
        >
          <Chat />
          <Vo id="chat" />
          <Whoosh />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Actions"
          durationInFrames={Math.round(7.4 * fps)}
        >
          <Actions />
          <Vo id="actions" />
          <Whoosh />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Media"
          durationInFrames={Math.round(7.6 * fps)}
        >
          <Media />
          <Vo id="media" />
          <Whoosh />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="Memory"
          durationInFrames={Math.round(7.2 * fps)}
        >
          <Memory />
          <Vo id="memory" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Briefing"
          durationInFrames={Math.round(5.8 * fps)}
        >
          <Briefing />
          <Vo id="briefing" />
          <Whoosh />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: T,
          })}
        />
        <TransitionSeries.Sequence
          name="Dashboard"
          durationInFrames={Math.round(9.4 * fps)}
        >
          <Dashboard />
          <Vo id="dashboard" />
          <Whoosh />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence
          name="CTA"
          durationInFrames={Math.round(8.4 * fps)}
        >
          <Cta />
          <Vo id="cta" />
          <Sequence
            name="Click"
            from={Math.round(CLICK_AT * fps) - 2}
            layout="none"
          >
            <Audio src="https://remotion.media/mouse-click.wav" volume={0.5} />
          </Sequence>
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Music />
    </>
  );
};
