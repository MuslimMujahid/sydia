import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise, Typewriter } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT } from "../../theme";
import {
  BigBubble,
  Caption,
  ChatCard,
  DayDivider,
  Line,
  LINES,
  Sfx,
  spokenAt,
} from "../parts";
import { TIKTOK_SCRIPT } from "../script";

// Rina's notes from the past few days scroll by while she says she logs everything.
const LOG_AT = 0.35;
const SCROLL_FROM = 0.2;
const SCROLL_TO = LOG_AT + LINES["log-rina"].duration;
const HISTORY_SCROLL = 620; // px the history starts pushed down, so the oldest day shows first

const ASK_AT = LOG_AT + LINES["log-rina"].duration + 0.45;
const SEND_AT = ASK_AT + LINES["ask-rina"].duration + 0.2;
const LIST_AT = SEND_AT + 0.9;
const LIST_VO = LIST_AT + 0.1;
const STEPS_AT = LIST_VO + LINES["list-sydia"].duration + 0.4;
const STEPS_VO = STEPS_AT + 0.1;
const RELIEF_AT = STEPS_VO + LINES["steps-sydia"].duration + 0.4;
const TICK_AT = RELIEF_AT + LINES["relief-rina"].duration + 0.2;

export const CHAT_SECONDS = TICK_AT + 1.1;

const QUESTION = TIKTOK_SCRIPT[2].text;

const ListItem = ({
  n,
  title,
  due,
  at,
}: {
  readonly n: number;
  readonly title: string;
  readonly due: string;
  readonly at: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Items take no space until spoken, so the bubble grows with the list.
  if (frame < at * fps) return null;
  return (
    <Rise at={at} distance={18} blur={false}>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "flex-start",
          padding: "14px 0",
          borderTop: n === 1 ? "none" : `1.5px solid ${COLORS.hairline}`,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            flexShrink: 0,
            background: n === 1 ? COLORS.accent : "rgba(239,90,138,0.12)",
            color: n === 1 ? "#fff" : COLORS.accent,
            fontWeight: 800,
            fontSize: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {n}
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div
            style={{
              fontSize: 28,
              color: n === 1 ? COLORS.accent : COLORS.muted,
              fontWeight: 600,
            }}
          >
            {due}
          </div>
        </div>
      </div>
    </Rise>
  );
};

const Step = ({
  label,
  time,
  at,
  done,
}: {
  readonly label: string;
  readonly time: string;
  readonly at: number;
  readonly done?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const checked = done !== undefined && frame >= done * fps;
  if (frame < at * fps) return null;
  return (
    <Rise at={at} distance={18} blur={false}>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            flexShrink: 0,
            border: checked ? "none" : "3px solid rgba(23,20,25,0.22)",
            background: checked ? COLORS.accent : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? (
            <Pop at={done as number}>
              <Icon name="check" size={32} color="#fff" />
            </Pop>
          ) : null}
        </div>
        <div
          style={{
            flex: 1,
            textDecoration: checked ? "line-through" : "none",
            color: checked ? COLORS.muted : COLORS.ink,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 26, color: COLORS.muted, fontWeight: 600 }}>
          {time}
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

export const Chat = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <ChatCard
        style={{
          translate: interpolate(
            frame,
            [0, 0.6 * fps],
            ["0px 120px", "0px 0px"],
            { ...clamp, easing: EASE_OUT },
          ),
          scale: String(
            interpolate(t, [LIST_AT, LIST_AT + 0.6], [1, 1.03], {
              ...clamp,
              easing: EASE_OUT,
            }),
          ),
        }}
        input={
          t >= ASK_AT && t < SEND_AT ? (
            <Typewriter
              text={QUESTION}
              at={ASK_AT}
              cps={QUESTION.length / (LINES["ask-rina"].duration - 0.3)}
              style={{ fontSize: 30, lineHeight: 1.35, padding: "16px 0" }}
            />
          ) : undefined
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            translate: `0px ${interpolate(
              t,
              [SCROLL_FROM, SCROLL_TO],
              [HISTORY_SCROLL, 0],
              {
                ...clamp,
                easing: EASE_IN_OUT,
              },
            )}px`,
          }}
        >
          <DayDivider>Jumat</DayDivider>
          <BigBubble from="me">
            Klien minta revisi logo, paling lambat Kamis.
          </BigBubble>
          <BigBubble from="sydia">Sudah saya catat.</BigBubble>
          <DayDivider>Sabtu</DayDivider>
          <BigBubble from="me">
            Capek banget hari ini, lembur sampai malam.
          </BigBubble>
          <BigBubble from="sydia">Istirahat yang cukup, ya.</BigBubble>
          <DayDivider>Senin</DayDivider>
          <BigBubble from="me">
            Rapat Jumat nanti aku yang bawain slide.
          </BigBubble>
          <BigBubble from="me">
            Bu Ratna minta laporan bulanan, kumpul Rabu jam 5 sore.
          </BigBubble>
          <BigBubble from="sydia">Siap, dua-duanya sudah saya catat.</BigBubble>
          <DayDivider>Hari ini</DayDivider>
        </div>

        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{QUESTION}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.3 && t < LIST_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={LIST_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Ini urutannya, dari yang paling dekat:
            </div>
            <ListItem
              n={1}
              title="Laporan bulanan untuk Bu Ratna"
              due="Besok, 17.00"
              at={spokenAt("list-sydia", LIST_VO, 1)}
            />
            <ListItem
              n={2}
              title="Revisi logo klien"
              due="Kamis"
              at={spokenAt("list-sydia", LIST_VO, 11)}
            />
            <ListItem
              n={3}
              title="Slide rapat"
              due="Jumat"
              at={spokenAt("list-sydia", LIST_VO, 17)}
            />
          </BigBubble>
        </Shown>
        <Shown at={STEPS_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Mulai dari laporan dulu, ya:
            </div>
            <Step
              label="Kumpulkan data penjualan"
              time="30 menit"
              at={spokenAt("steps-sydia", STEPS_VO, 5)}
              done={TICK_AT}
            />
            <Step
              label="Tulis ringkasan"
              time="1 jam"
              at={spokenAt("steps-sydia", STEPS_VO, 10)}
            />
            <Step
              label="Kirim ke Bu Ratna"
              time="Sebelum 17.00"
              at={spokenAt("steps-sydia", STEPS_VO, 10) + 0.25}
            />
          </BigBubble>
        </Shown>
        <Shown at={RELIEF_AT} from="me">
          <BigBubble from="me">{TIKTOK_SCRIPT[5].text}</BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="log-rina" at={LOG_AT} speaker="rina" />
      <Caption id="ask-rina" at={ASK_AT} speaker="rina" />
      <Caption id="list-sydia" at={LIST_VO} speaker="sydia" />
      <Caption id="steps-sydia" at={STEPS_VO} speaker="sydia" />
      <Caption id="relief-rina" at={RELIEF_AT + 0.05} speaker="rina" />

      <Line id="log-rina" at={LOG_AT} />
      <Line id="ask-rina" at={ASK_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={LIST_AT} />
      <Line id="list-sydia" at={LIST_VO} />
      <Sfx kind="received" at={STEPS_AT} />
      <Line id="steps-sydia" at={STEPS_VO} />
      <Sfx kind="sent" at={RELIEF_AT} />
      <Line id="relief-rina" at={RELIEF_AT + 0.05} />
    </AbsoluteFill>
  );
};
