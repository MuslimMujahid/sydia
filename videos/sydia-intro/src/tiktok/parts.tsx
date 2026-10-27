import type React from "react";
import { Audio } from "@remotion/media";
import {
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Bubble } from "../components/Phone";
import { Icon, Logo } from "../components/Ui";
import { COLORS, EASE_OUT, GRADIENT } from "../theme";
import type { TiktokLineId } from "./script";
import timings from "./voice-timings.json";

export const LINES = timings;

// TikTok draws its own UI over the frame: tabs at the top, caption and
// music at the bottom, action buttons on the right. Keep content inside this box.
export const SAFE = { left: 90, right: 950, top: 240, bottom: 1470 };
export const SAFE_WIDTH = SAFE.right - SAFE.left;

export const spokenAt = (
  line: TiktokLineId,
  lineStart: number,
  wordIndex: number,
) => lineStart + timings[line].words[wordIndex].start;

// One voice clip from public/, placed at `at` seconds into its scene.
export const VoiceClip = ({
  name,
  src,
  at,
  volume,
}: {
  readonly name: string;
  readonly src: string;
  readonly at: number;
  readonly volume?: number;
}) => {
  const { fps } = useVideoConfig();
  return (
    <Audio
      name={name}
      src={staticFile(src)}
      from={Math.round(at * fps)}
      volume={volume}
    />
  );
};

export const Line = ({
  id,
  at,
}: {
  readonly id: TiktokLineId;
  readonly at: number;
}) => <VoiceClip name={id} src={`tiktok/${id}.mp3`} at={at} />;

export const Sfx = ({
  kind,
  at,
}: {
  readonly kind: "sent" | "received";
  readonly at: number;
}) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={`Sfx ${kind}`} from={Math.round(at * fps)} layout="none">
      <Audio
        src={staticFile(`usecase/sfx-${kind}.mp3`)}
        volume={kind === "sent" ? 0.35 : 0.45}
      />
    </Sequence>
  );
};

type Word = { text: string; start: number; end: number };
export type VoiceTiming = { duration: number; words: Word[] };

// Splits a line into short caption pages: at most three words, breaking after punctuation.
const toPages = (words: Word[]) => {
  const pages: Word[][] = [[]];
  words.forEach((w) => {
    const page = pages[pages.length - 1];
    page.push(w);
    if (page.length >= 3 || /[.,?!]$/.test(w.text)) pages.push([]);
  });
  return pages.filter((p) => p.length > 0);
};

export const Caption = ({
  id,
  at,
  speaker,
}: {
  readonly id: TiktokLineId;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
}) => <CaptionFor line={timings[id]} at={at} speaker={speaker} />;

// TikTok-style captions: one short page at a time, the spoken word lit in the brand gradient.
// `tone="dark"` is for captions over a dark background.
export const CaptionFor = ({
  line,
  at,
  speaker,
  tone = "light",
}: {
  readonly line: VoiceTiming;
  readonly at: number;
  readonly speaker: "rina" | "sydia";
  readonly tone?: "light" | "dark";
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - at;
  if (t < -0.05 || t > line.duration + 0.25) return null;

  const pages = toPages(line.words);
  const page = pages.reduce(
    (current, p) => (p[0].start - 0.05 <= t ? p : current),
    pages[0],
  );
  const pageStart = page[0].start - 0.05;
  const pop = interpolate(t, [pageStart, pageStart + 0.18], [0.86, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        width: SAFE_WIDTH,
        top: SAFE.top + 10,
        height: 300,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 34,
          fontWeight: 700,
          color: tone === "dark" ? "rgba(255,255,255,0.75)" : COLORS.muted,
        }}
      >
        {speaker === "sydia" ? <Logo size={44} /> : null}
        {speaker === "sydia" ? "Sydia" : "Rina"}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          // Without a definite width the page stays one line and spills past the safe area.
          width: "100%",
          justifyContent: "center",
          columnGap: "0.24em",
          fontSize: 80,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 1.08,
          textAlign: "center",
          scale: String(pop),
        }}
      >
        {page.map((w, i) => {
          const lit = t >= w.start - 0.05;
          return (
            <span
              key={i}
              style={
                lit
                  ? {
                      backgroundImage: GRADIENT,
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      color: "transparent",
                      paddingBottom: "0.06em",
                    }
                  : { color: tone === "dark" ? "#ffffff" : COLORS.ink }
              }
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const WA_GREEN = "#1fa855";

// A full-width WhatsApp chat with Sydia, sized for a vertical frame.
export const ChatCard = ({
  children,
  input,
  button,
  buttonStyle,
  style,
}: {
  readonly children: React.ReactNode;
  readonly input?: React.ReactNode;
  // Forces the composer button, e.g. the mic while a voice note records.
  readonly button?: "send" | "mic";
  readonly buttonStyle?: React.CSSProperties;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      position: "absolute",
      left: SAFE.left,
      top: 560,
      width: SAFE_WIDTH,
      height: 900,
      borderRadius: 48,
      overflow: "hidden",
      background: "#efeae2",
      display: "flex",
      flexDirection: "column",
      boxShadow:
        "rgba(23,20,25,0.16) 0 50px 100px -40px, rgba(23,20,25,0.08) 0 10px 30px -10px",
      border: `1.5px solid ${COLORS.border}`,
      ...style,
    }}
  >
    <div
      style={{
        background: COLORS.surface,
        padding: "26px 32px",
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          background: COLORS.canvas,
          border: `1.5px solid ${COLORS.hairline}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Logo size={48} />
      </div>
      <div>
        <div style={{ fontSize: 34, fontWeight: 700, color: COLORS.ink }}>
          Sydia
        </div>
        <div style={{ fontSize: 24, fontWeight: 500, color: WA_GREEN }}>
          online
        </div>
      </div>
    </div>
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        padding: "24px 26px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 18,
      }}
    >
      {children}
    </div>
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 22px 26px",
        alignItems: "center",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 80,
          borderRadius: 40,
          background: COLORS.surface,
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          fontSize: 30,
          color: COLORS.ink,
        }}
      >
        {input ?? <span style={{ color: "#8f8a93" }}>Ketik pesan</span>}
      </div>
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          background: WA_GREEN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...buttonStyle,
        }}
      >
        <Icon
          name={button ?? (input ? "send" : "mic")}
          size={36}
          color="#fff"
        />
      </div>
    </div>
  </div>
);

// Chat bubble scaled up for the vertical frame.
export const BigBubble = ({
  from,
  children,
  style,
}: {
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
  <Bubble
    from={from}
    style={{ fontSize: 34, maxWidth: 640, padding: "18px 26px", ...style }}
  >
    {children}
  </Bubble>
);

export const DayDivider = ({
  children,
}: {
  readonly children: React.ReactNode;
}) => (
  <div
    style={{
      alignSelf: "center",
      background: "rgba(255,255,255,0.9)",
      borderRadius: 14,
      padding: "8px 20px",
      fontSize: 24,
      fontWeight: 600,
      color: COLORS.muted,
    }}
  >
    {children}
  </div>
);
