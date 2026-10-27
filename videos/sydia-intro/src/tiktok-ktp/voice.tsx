import { CaptionFor, VoiceClip } from "../tiktok/parts";
import type { KtpLineId } from "./script";
import timings from "./voice-timings.json";

export const LINES = timings;

export const spokenAt = (
  line: KtpLineId,
  lineStart: number,
  wordIndex: number,
) => lineStart + timings[line].words[wordIndex].start;

export const Line = ({
  id,
  at,
  volume,
}: {
  readonly id: KtpLineId;
  readonly at: number;
  readonly volume?: number;
}) => (
  <VoiceClip name={id} src={`tiktok-ktp/${id}.mp3`} at={at} volume={volume} />
);

export const Caption = ({
  id,
  at,
  speaker,
  tone,
}: {
  readonly id: KtpLineId;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
  readonly tone?: "light" | "dark";
}) => <CaptionFor line={timings[id]} at={at} speaker={speaker} tone={tone} />;
