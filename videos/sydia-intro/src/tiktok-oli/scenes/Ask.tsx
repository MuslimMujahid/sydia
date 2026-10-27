import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Rise, Typewriter } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { DailyNote } from "../note";
import { FactRow, NoteChip, Shown } from "../parts";
import { OLI_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["ask-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 0.65;
const REPLY_VO = REPLY_AT + 0.1;
// Each fact lands on the words that name it: the date, the weekday, the gap.
const DATE_AT = REPLY_VO + 0.05;
const DAY_AT = spokenAt("reply-sydia", REPLY_VO, 4) - 0.1; // "hari"
const AGE_AT = spokenAt("reply-sydia", REPLY_VO, 6) - 0.1; // "tepat"
const NOTE_AT = AGE_AT + 0.45;

export const ASK_SECONDS = REPLY_VO + LINES["reply-sydia"].duration + 0.7;

const MESSAGE = OLI_SCRIPT[1].text;

export const Ask = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.1} />
      <ChatCard
        input={
          t >= TYPE_AT && t < SEND_AT ? (
            <Typewriter
              text={MESSAGE}
              at={TYPE_AT}
              cps={MESSAGE.length / (LINES["ask-rina"].duration - 0.3)}
              style={{ fontSize: 30 }}
            />
          ) : undefined
        }
      >
        <DayDivider>Hari ini</DayDivider>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{MESSAGE}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.3 && t < REPLY_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={REPLY_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700 }}>
              Terakhir ganti oli 27 Agustus 2026.
            </div>
            <Rise
              at={DATE_AT}
              distance={22}
              blur={false}
              style={{ marginTop: 16 }}
            >
              <div
                style={{
                  borderRadius: 26,
                  background: "#fff8f4",
                  border: "2px solid rgba(239,90,138,0.22)",
                  padding: "22px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                }}
              >
                <FactRow at={DATE_AT} icon="calendar" label="Tanggal">
                  27 Agustus 2026
                </FactRow>
                <FactRow at={DAY_AT} icon="sun" label="Hari">
                  Kamis
                </FactRow>
                <FactRow at={AGE_AT} icon="clock" label="Sudah berjalan">
                  Tepat 2 bulan
                </FactRow>
              </div>
            </Rise>
            {t >= NOTE_AT ? (
              <Rise
                at={NOTE_AT}
                distance={16}
                blur={false}
                style={{ marginTop: 16 }}
              >
                <NoteChip label="Catatan harian · 27 Agu" />
                <div style={{ marginTop: 14 }}>
                  <DailyNote at={NOTE_AT + 0.15} width={560} />
                </div>
              </Rise>
            ) : null}
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="ask-rina" at={TYPE_AT} speaker="rina" />
      <Caption id="reply-sydia" at={REPLY_VO} speaker="sydia" />

      <Line id="ask-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={REPLY_AT} />
      <Line id="reply-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
