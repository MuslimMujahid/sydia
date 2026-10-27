import { CaptionFor, VoiceClip } from "../tiktok/parts";
import type { OliLineId } from "./script";
import timings from "./voice-timings.json";

export const LINES = timings;

export const spokenAt = (
  line: OliLineId,
  lineStart: number,
  wordIndex: number,
) => lineStart + timings[line].words[wordIndex].start;

export const Line = ({
  id,
  at,
  volume,
}: {
  readonly id: OliLineId;
  readonly at: number;
  readonly volume?: number;
}) => (
  <VoiceClip name={id} src={`tiktok-oli/${id}.mp3`} at={at} volume={volume} />
);

export const Caption = ({
  id,
  at,
  speaker,
  tone,
}: {
  readonly id: OliLineId;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
  readonly tone?: "light" | "dark";
}) => <CaptionFor line={timings[id]} at={at} speaker={speaker} tone={tone} />;
