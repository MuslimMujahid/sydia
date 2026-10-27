import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Rise, Typewriter } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { Shown } from "../parts";
import { KUE_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["ask-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 1.0;
const REPLY_VO = REPLY_AT + 0.1;
// The recall itself is the point, so the memory card lands on "kacang".
const FACT_AT = spokenAt("reply-sydia", REPLY_VO, 2);
const SOURCE_AT = spokenAt("reply-sydia", REPLY_VO, 5);
const TIP_AT = spokenAt("reply-sydia", REPLY_VO, 11);

export const ASK_SECONDS = REPLY_VO + LINES["reply-sydia"].duration + 0.7;

const MESSAGE = KUE_SCRIPT[2].text;

// What Sydia remembered, shown as a saved note rather than a chat history.
const MemoryCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < FACT_AT) return null;
  return (
    <Rise at={FACT_AT} distance={22} blur={false} style={{ marginTop: 16 }}>
      <div
        style={{
          borderRadius: 26,
          background: "#fff6f2",
          border: `2px solid rgba(239,90,138,0.22)`,
          padding: "22px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: COLORS.surface,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="brain" size={32} color={COLORS.accent} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>
            Dita · alergi kacang
          </div>
        </div>
        {t >= SOURCE_AT ? (
          <Rise at={SOURCE_AT} distance={16} blur={false}>
            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: `2px solid rgba(239,90,138,0.18)`,
                fontSize: 26,
                lineHeight: 1.35,
                color: COLORS.muted,
              }}
            >
              Dari cerita Anda · Juli, makan siang bareng
            </div>
          </Rise>
        ) : null}
      </div>
    </Rise>
  );
};

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
            <div style={{ fontWeight: 700 }}>Dita alergi kacang.</div>
            <MemoryCard />
            {t >= TIP_AT ? (
              <Rise
                at={TIP_AT}
                distance={16}
                blur={false}
                style={{ marginTop: 16 }}
              >
                <div style={{ display: "flex", gap: 12 }}>
                  <Icon name="check" size={32} color="#2c7a47" />
                  Pilih kue tanpa kacang
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
