import type React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const HOOK_AT = 0.05; // the caption shows from frame one
const REC_AT = HOOK_AT + LINES["hook-rina"].duration + 0.25;
const VN_AT = REC_AT + 0.15;
const SEND_AT = VN_AT + LINES["vn-rina"].duration + 0.25;
const REPLY_AT = SEND_AT + 1.0;
const REPLY_VO = REPLY_AT + 0.1;

export const RECORD_SECONDS = REPLY_VO + LINES["reply-sydia"].duration + 0.6;

const VN_LENGTH = "0:08";

// Bars for a voice note; `live` makes them dance while recording.
const Waveform = ({
  bars,
  live,
  progress = 0,
  color,
}: {
  readonly bars: number;
  readonly live?: boolean;
  readonly progress?: number;
  readonly color: string;
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        gap: 5,
        alignItems: "center",
        height: 56,
        flex: 1,
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const base =
          0.35 +
          0.65 * Math.abs(Math.sin(i * 1.9 + 0.7)) * (0.5 + ((i * 7) % 5) / 8);
        const h = live
          ? 10 + Math.abs(Math.sin(i * 1.3 + frame / 3)) * 44 * base
          : 10 + 40 * base;
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: h,
              borderRadius: 3,
              background: color,
              opacity: live || i / bars <= progress ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
};

const RecordingBar = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = Math.max(0, Math.floor(frame / fps - REC_AT));
  const blink = Math.floor(frame / (fps / 2)) % 2 === 0;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 18, width: "100%" }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          background: "#e5484d",
          opacity: blink ? 1 : 0.3,
        }}
      />
      <div
        style={{
          fontSize: 30,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        0:{String(seconds).padStart(2, "0")}
      </div>
      <Waveform bars={22} live color="#8f8a93" />
    </div>
  );
};

const VoiceNoteBubble = () => (
  <BigBubble from="me" style={{ width: 560, padding: "20px 24px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          background: "#1fa855",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="play" size={30} color="#fff" />
      </div>
      <Waveform bars={28} progress={1} color="#3c8c5a" />
      <div style={{ fontSize: 26, color: "#3c6e4e", fontWeight: 600 }}>
        {VN_LENGTH}
      </div>
    </div>
  </BigBubble>
);

const ReminderRow = ({
  title,
  when,
  at,
  first,
}: {
  readonly title: string;
  readonly when: string;
  readonly at: number;
  readonly first?: boolean;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  return (
    <Rise at={at} distance={18} blur={false}>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          padding: "14px 0",
          borderTop: first ? "none" : `1.5px solid ${COLORS.hairline}`,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "#fff3ee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="bell" size={32} color={COLORS.accent} />
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 28, color: COLORS.accent, fontWeight: 600 }}>
            {when}
          </div>
        </div>
      </div>
    </Rise>
  );
};

const Shown = ({
  at,
  from,
  children,
}: {
  readonly at: number;
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  return (
    <Pop
      at={at}
      style={{
        alignSelf: from === "me" ? "flex-end" : "flex-start",
        transformOrigin: from === "me" ? "right bottom" : "left bottom",
      }}
    >
      {children}
    </Pop>
  );
};

export const Record = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const recording = t >= REC_AT && t < SEND_AT;
  // The mic pulses before Rina holds it, then grows while she records.
  const pulse = 1 + 0.06 * Math.max(0, Math.sin(frame / 4));

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.1} />
      {/* No entrance: a TikTok hook has to read on the very first frame. */}
      <ChatCard
        input={recording ? <RecordingBar /> : undefined}
        button="mic"
        buttonStyle={{
          scale: String(recording ? 1.3 : t < REC_AT ? pulse : 1),
          boxShadow:
            t < REC_AT
              ? `0 0 0 ${10 * (pulse - 1) * 16}px rgba(31,168,85,0.18)`
              : undefined,
        }}
      >
        <DayDivider>Kemarin</DayDivider>
        <BigBubble from="me">Catat, kunci cadangan ada di laci meja.</BigBubble>
        <BigBubble from="sydia">Sudah saya catat.</BigBubble>
        <DayDivider>Hari ini</DayDivider>
        <Shown at={SEND_AT} from="me">
          <VoiceNoteBubble />
        </Shown>
        {t >= SEND_AT + 0.3 && t < REPLY_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={REPLY_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Siap, dua-duanya sudah saya catat:
            </div>
            <ReminderRow
              first
              title="Beli obat untuk Mama"
              when="Hari ini, 19.00"
              at={spokenAt("reply-sydia", REPLY_VO, 5)}
            />
            <ReminderRow
              title="Transfer SPP Adik"
              when="Besok pagi, 08.00"
              at={spokenAt("reply-sydia", REPLY_VO, 13)}
            />
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="hook-rina" at={HOOK_AT} speaker="rina" />
      <Caption id="vn-rina" at={VN_AT} speaker="rina" />
      <Caption id="reply-sydia" at={REPLY_VO} speaker="sydia" />

      <Line id="hook-rina" at={HOOK_AT} />
      <Line id="vn-rina" at={VN_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={REPLY_AT} />
      <Line id="reply-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
