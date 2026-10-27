import { CaptionFor, VoiceClip } from "../tiktok/parts";
import type { LanggananLineId } from "./script";
import timings from "./voice-timings.json";

export const LINES = timings;

export const spokenAt = (
  line: LanggananLineId,
  lineStart: number,
  wordIndex: number,
) => lineStart + timings[line].words[wordIndex].start;

export const Line = ({
  id,
  at,
}: {
  readonly id: LanggananLineId;
  readonly at: number;
}) => <VoiceClip name={id} src={`tiktok-langganan/${id}.mp3`} at={at} />;

export const Caption = ({
  id,
  at,
  speaker,
}: {
  readonly id: LanggananLineId;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
}) => <CaptionFor line={timings[id]} at={at} speaker={speaker} />;
