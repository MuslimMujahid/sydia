import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Typewriter } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { Avatar, BUDI, MailGlyph, Shown } from "../parts";
import { MEET_SCRIPT } from "../script";
import { Caption, Line, LINES } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["ask-rina"].duration + 0.15;
const TYPING_AT = SEND_AT + 0.3;

export const ASK_SECONDS = TYPING_AT + 1.1;

const MESSAGE = MEET_SCRIPT[1].text;

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
              cps={MESSAGE.length / (LINES["ask-rina"].duration - 0.25)}
              style={{ fontSize: 29 }}
            />
          ) : undefined
        }
      >
        {/* Pak Budi's contact, saved back in August. It is why Sydia already
            knows which email the invitation goes to. */}
        <DayDivider>14 Agustus</DayDivider>
        <Shown at={0} from="me">
          <BigBubble from="me">
            Simpan kontak klien: {BUDI.name}, {BUDI.email}
          </BigBubble>
        </Shown>
        <Shown at={0} from="sydia">
          <BigBubble from="sydia" style={{ width: 540 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Avatar initials={BUDI.initials} size={64} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>Tersimpan: {BUDI.name}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 6,
                    fontSize: 28,
                    color: COLORS.muted,
                  }}
                >
                  <MailGlyph size={26} />
                  {BUDI.email}
                </div>
              </div>
            </div>
          </BigBubble>
        </Shown>
        <DayDivider>Hari ini · 13.41</DayDivider>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{MESSAGE}</BigBubble>
        </Shown>
        {t >= TYPING_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
      </ChatCard>

      <Caption id="ask-rina" at={TYPE_AT} speaker="rina" />

      <Line id="ask-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
    </AbsoluteFill>
  );
};
