import { CaptionFor, VoiceClip } from "../tiktok/parts";
import type { PengingatLineId } from "./script";
import timings from "./voice-timings.json";

export const LINES = timings;

export const spokenAt = (
  line: PengingatLineId,
  lineStart: number,
  wordIndex: number,
) => lineStart + timings[line].words[wordIndex].start;

export const Line = ({
  id,
  at,
  volume,
}: {
  readonly id: PengingatLineId;
  readonly at: number;
  readonly volume?: number;
}) => (
  <VoiceClip
    name={id}
    src={`tiktok-pengingat/${id}.mp3`}
    at={at}
    volume={volume}
  />
);

export const Caption = ({
  id,
  at,
  speaker,
  tone,
}: {
  readonly id: PengingatLineId;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
  readonly tone?: "light" | "dark";
}) => <CaptionFor line={timings[id]} at={at} speaker={speaker} tone={tone} />;
