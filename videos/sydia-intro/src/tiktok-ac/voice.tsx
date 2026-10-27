import { CaptionFor, VoiceClip } from "../tiktok/parts";
import type { AcLineId } from "./script";
import timings from "./voice-timings.json";

export const LINES = timings;

export const spokenAt = (
  line: AcLineId,
  lineStart: number,
  wordIndex: number,
) => lineStart + timings[line].words[wordIndex].start;

export const Line = ({
  id,
  at,
  volume,
}: {
  readonly id: AcLineId;
  readonly at: number;
  readonly volume?: number;
}) => (
  <VoiceClip name={id} src={`tiktok-ac/${id}.mp3`} at={at} volume={volume} />
);

export const Caption = ({
  id,
  at,
  speaker,
  tone,
}: {
  readonly id: AcLineId;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
  readonly tone?: "light" | "dark";
}) => <CaptionFor line={timings[id]} at={at} speaker={speaker} tone={tone} />;
