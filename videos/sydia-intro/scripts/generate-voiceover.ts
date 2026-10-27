// Generates one ElevenLabs clip per line, plus word timings.
// Usage: node --env-file=.env --experimental-strip-types scripts/generate-voiceover.ts <intro|usecase|tiktok|pengingat|langganan|ktp|kue> [lineId...]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SCRIPT } from "../src/script.ts";
import { TIKTOK_SCRIPT } from "../src/tiktok/script.ts";
import { PENGINGAT_SCRIPT } from "../src/tiktok-pengingat/script.ts";
import { LANGGANAN_SCRIPT } from "../src/tiktok-langganan/script.ts";
import { KTP_SCRIPT } from "../src/tiktok-ktp/script.ts";
import { KUE_SCRIPT } from "../src/tiktok-kue/script.ts";
import { USECASE_SCRIPT } from "../src/usecase/script.ts";

const apiKey = process.env.ELEVENLABS_API_KEY;
const voices: Record<string, string | undefined> = {
  narrator: process.env.ELEVENLABS_VOICE_ID,
  // Rina, the user in the use-case video, borrows the intro narrator's voice.
  rina: process.env.ELEVENLABS_VOICE_ID,
  sydia: process.env.ELEVENLABS_SYDIA_VOICE_ID,
};
if (!apiKey) throw new Error("Set ELEVENLABS_API_KEY in .env");

type Line = { id: string; text: string; speaker?: string };
const SETS: Record<
  string,
  { lines: readonly Line[]; dir: string; timingsFile: string }
> = {
  intro: {
    lines: SCRIPT,
    dir: "public/voiceover",
    timingsFile: "src/voiceover-timings.json",
  },
  usecase: {
    lines: USECASE_SCRIPT,
    dir: "public/usecase",
    timingsFile: "src/usecase/voice-timings.json",
  },
  tiktok: {
    lines: TIKTOK_SCRIPT,
    dir: "public/tiktok",
    timingsFile: "src/tiktok/voice-timings.json",
  },
  pengingat: {
    lines: PENGINGAT_SCRIPT,
    dir: "public/tiktok-pengingat",
    timingsFile: "src/tiktok-pengingat/voice-timings.json",
  },
  langganan: {
    lines: LANGGANAN_SCRIPT,
    dir: "public/tiktok-langganan",
    timingsFile: "src/tiktok-langganan/voice-timings.json",
  },
  ktp: {
    lines: KTP_SCRIPT,
    dir: "public/tiktok-ktp",
    timingsFile: "src/tiktok-ktp/voice-timings.json",
  },
  kue: {
    lines: KUE_SCRIPT,
    dir: "public/tiktok-kue",
    timingsFile: "src/tiktok-kue/voice-timings.json",
  },
};

type Word = { text: string; start: number; end: number };
type Timing = { id: string; duration: number; words: Word[] };

const [setName = "intro", ...only] = process.argv.slice(2);
const set = SETS[setName];
if (!set) throw new Error(`Unknown set "${setName}"`);
const timings: Record<string, Timing> = existsSync(set.timingsFile)
  ? JSON.parse(readFileSync(set.timingsFile, "utf8"))
  : {};

const toWords = (chars: string[], starts: number[], ends: number[]) => {
  const words: Word[] = [];
  let current: Word | null = null;
  chars.forEach((char, i) => {
    if (/\s/.test(char)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) current = { text: "", start: starts[i], end: ends[i] };
    current.text += char;
    current.end = ends[i];
  });
  if (current) words.push(current);
  return words;
};

for (const [index, line] of set.lines.entries()) {
  if (only.length > 0 && !only.includes(line.id)) continue;
  const speaker = line.speaker ?? "narrator";
  const voiceId = voices[speaker];
  if (!voiceId) throw new Error(`No voice ID for ${speaker}`);
  // Only pass neighbouring lines by the same speaker, so prosody stays in character.
  const sameSpeaker = (l?: Line) =>
    l && (l.speaker ?? "narrator") === speaker ? l.text : undefined;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: line.text,
        model_id: "eleven_v4",
        previous_text: sameSpeaker(set.lines[index - 1]),
        next_text: sameSpeaker(set.lines[index + 1]),
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`${line.id}: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };
  writeFileSync(
    `${set.dir}/${line.id}.mp3`,
    Buffer.from(body.audio_base64, "base64"),
  );

  const {
    characters,
    character_start_times_seconds,
    character_end_times_seconds,
  } = body.alignment;
  timings[line.id] = {
    id: line.id,
    duration: character_end_times_seconds.at(-1) ?? 0,
    words: toWords(
      characters,
      character_start_times_seconds,
      character_end_times_seconds,
    ),
  };
  console.log(`${line.id}: ${timings[line.id].duration.toFixed(2)}s`);
}

writeFileSync(set.timingsFile, JSON.stringify(timings, null, 2) + "\n");
