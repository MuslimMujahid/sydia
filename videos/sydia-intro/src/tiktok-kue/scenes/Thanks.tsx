import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Rise, Typewriter } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, Sfx } from "../../tiktok/parts";
import { Shown } from "../parts";
import { KUE_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["thanks-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 0.8;
const REPLY_VO = REPLY_AT + 0.1;
const CARD_AT = spokenAt("thanks-sydia", REPLY_VO, 2);
const TASK_AT = spokenAt("thanks-sydia", REPLY_VO, 10);

export const THANKS_SECONDS = REPLY_VO + LINES["thanks-sydia"].duration + 0.7;

const MESSAGE = KUE_SCRIPT[5].text;

// The reminder Sydia sets without being asked.
const ReminderCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < CARD_AT) return null;
  return (
    <Rise at={CARD_AT} distance={24} blur={false} style={{ marginTop: 16 }}>
      <div
        style={{
          borderRadius: 26,
          background: "#faf8f6",
          border: `2px solid ${COLORS.hairline}`,
          padding: "22px 24px",
          display: "flex",
          gap: 18,
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
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.accent }}>
            Besok, 07.00
          </div>
          {t >= TASK_AT ? (
            <Rise at={TASK_AT} distance={14} blur={false}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  marginTop: 6,
                  lineHeight: 1.3,
                }}
              >
                Ucapkan selamat ulang tahun ke Dita
              </div>
            </Rise>
          ) : null}
        </div>
      </div>
    </Rise>
  );
};

export const Thanks = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />
      <ChatCard
        input={
          t >= TYPE_AT && t < SEND_AT ? (
            <Typewriter
              text={MESSAGE}
              at={TYPE_AT}
              cps={MESSAGE.length / (LINES["thanks-rina"].duration - 0.3)}
              style={{ fontSize: 30 }}
            />
          ) : undefined
        }
      >
        <BigBubble from="sydia">
          Dita alergi kacang. Pilih kue tanpa kacang, ya.
        </BigBubble>
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
            <div style={{ fontWeight: 700 }}>Sama-sama, Rina.</div>
            <div>Besok pagi saya ingatkan.</div>
            <ReminderCard />
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="thanks-rina" at={TYPE_AT} speaker="rina" />
      <Caption id="thanks-sydia" at={REPLY_VO} speaker="sydia" />

      <Line id="thanks-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={REPLY_AT} />
      <Line id="thanks-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
