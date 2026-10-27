import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Typewriter } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { DocBubbleBody, Shown } from "../parts";
import { KOS_SCRIPT } from "../script";
import { Caption, Line, LINES } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["ask-rina"].duration + 0.1;
const READ_AT = SEND_AT + 0.5;

export const ASK_SECONDS = READ_AT + 0.8;

const MESSAGE = KOS_SCRIPT[1].text;

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
        {/* The contract Rina saved months ago, still sitting in the chat. */}
        <DayDivider>5 Januari</DayDivider>
        <Shown at={0} from="me">
          <BigBubble from="me">
            <DocBubbleBody name="Kontrak Kos 2026.pdf" meta="PDF · 6 halaman" />
          </BigBubble>
        </Shown>
        <Shown at={0} from="sydia">
          <BigBubble from="sydia">Sudah saya simpan.</BigBubble>
        </Shown>
        <DayDivider>Hari ini</DayDivider>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{MESSAGE}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.25 && t < READ_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        {t >= READ_AT ? (
          <Pop
            at={READ_AT}
            style={{ alignSelf: "flex-start", transformOrigin: "left bottom" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                borderRadius: 24,
                background: COLORS.surface,
                boxShadow: "rgba(23,20,25,0.08) 0 1px 2px",
                padding: "16px 24px",
                fontSize: 29,
                fontWeight: 600,
                color: COLORS.muted,
              }}
            >
              <Icon name="search" size={30} color={COLORS.accent} />
              Membaca kontrak kos
            </div>
          </Pop>
        ) : null}
      </ChatCard>

      <Caption id="ask-rina" at={TYPE_AT} speaker="rina" />

      <Line id="ask-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
    </AbsoluteFill>
  );
};
