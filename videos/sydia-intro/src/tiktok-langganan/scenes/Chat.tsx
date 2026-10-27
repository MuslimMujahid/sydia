import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Typewriter } from "../../components/Anim";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, EASE_IN_OUT, EASE_OUT, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { LANGGANAN_SCRIPT } from "../script";
import { Row, Shown } from "../ui";
import { Caption, Line, LINES, spokenAt } from "../voice";

// Rina's sign-up notes scroll by while she says she always tells Sydia.
const LOG_AT = 0.35;
const SCROLL_FROM = 0.2;
const SCROLL_TO = LOG_AT + LINES["log-rina"].duration;
const HISTORY_SCROLL = 560; // px the history starts pushed down, so the oldest note shows first

// The morning briefing arrives on its own; Rina hasn't asked anything.
const BRIEF_AT = SCROLL_TO + 0.6;
const BRIEF_VO = BRIEF_AT + 0.1;
const DECIDE_AT = BRIEF_VO + LINES["brief-sydia"].duration + 0.4;
const SEND_AT = DECIDE_AT + LINES["decide-rina"].duration + 0.15;
const OK_AT = SEND_AT + 0.8;
const OK_VO = OK_AT + 0.1;

export const CHAT_SECONDS = OK_VO + LINES["ok-sydia"].duration + 0.7;

const DECISION = LANGGANAN_SCRIPT[4].text;

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
            [0, 0.5 * fps],
            ["0px 100px", "0px 0px"],
            { ...clamp, easing: EASE_OUT },
          ),
        }}
        input={
          t >= DECIDE_AT && t < SEND_AT ? (
            <Typewriter
              text={DECISION}
              at={DECIDE_AT}
              cps={DECISION.length / (LINES["decide-rina"].duration - 0.3)}
              style={{ fontSize: 30 }}
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
          <DayDivider>27 September</DayDivider>
          <BigBubble from="me">
            Baru langganan Netflix, perpanjang tiap tanggal 27.
          </BigBubble>
          <BigBubble from="sydia">Sudah saya catat.</BigBubble>
          <DayDivider>3 Oktober</DayDivider>
          <BigBubble from="me">Spotify Premium juga, tiap tanggal 3.</BigBubble>
          <BigBubble from="sydia">Siap, tercatat.</BigBubble>
          <DayDivider>Kemarin lusa</DayDivider>
          <BigBubble from="me">
            Coba trial Canva Pro, katanya gratis 7 hari.
          </BigBubble>
          <BigBubble from="sydia">
            Oke, saya ingatkan sebelum trialnya habis.
          </BigBubble>
          <DayDivider>Hari ini</DayDivider>
        </div>

        <Shown at={BRIEF_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700 }}>Selamat pagi, Rina!</div>
            <div style={{ fontSize: 28, color: COLORS.muted, marginBottom: 4 }}>
              Langganan yang perlu dicek:
            </div>
            <Row
              first
              urgent
              icon="bell"
              title="Trial Canva Pro"
              note="Habis besok"
              at={spokenAt("brief-sydia", BRIEF_VO, 3)}
            />
            <Row
              icon="calendar"
              title="Netflix"
              note="Diperpanjang lusa"
              at={spokenAt("brief-sydia", BRIEF_VO, 8)}
            />
            {t >= spokenAt("brief-sydia", BRIEF_VO, 12) ? (
              <div style={{ marginTop: 10, fontWeight: 600 }}>
                Mau lanjut atau berhenti?
              </div>
            ) : null}
          </BigBubble>
        </Shown>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{DECISION}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.3 && t < OK_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={OK_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Siap.</div>
            <Row
              first
              urgent
              icon="bell"
              title="Batalkan Canva Pro"
              note="Hari ini, biar nggak kepotong"
              at={spokenAt("ok-sydia", OK_VO, 1)}
            />
            <Row
              icon="check"
              title="Netflix"
              note="Tetap jalan"
              at={spokenAt("ok-sydia", OK_VO, 9)}
            />
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="log-rina" at={LOG_AT} speaker="rina" />
      <Caption id="brief-sydia" at={BRIEF_VO} speaker="sydia" />
      <Caption id="decide-rina" at={DECIDE_AT} speaker="rina" />
      <Caption id="ok-sydia" at={OK_VO} speaker="sydia" />

      <Line id="log-rina" at={LOG_AT} />
      <Sfx kind="received" at={BRIEF_AT} />
      <Line id="brief-sydia" at={BRIEF_VO} />
      <Line id="decide-rina" at={DECIDE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={OK_AT} />
      <Line id="ok-sydia" at={OK_VO} />
    </AbsoluteFill>
  );
};
