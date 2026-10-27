import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Typewriter } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { AliasChip, Avatar, Shown } from "../parts";
import { JOKO } from "../contact";
import { AC_SCRIPT } from "../script";
import { Caption, Line, LINES } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["ask-rina"].duration + 0.15;
const SEARCH_AT = SEND_AT + 0.5;

export const ASK_SECONDS = SEARCH_AT + 1.15;

const MESSAGE = AC_SCRIPT[1].text;

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
            // 28px, not the usual 30: this question is long enough that the
            // caret would otherwise sit flush against the composer's edge.
            <Typewriter
              text={MESSAGE}
              at={TYPE_AT}
              cps={MESSAGE.length / (LINES["ask-rina"].duration - 0.3)}
              style={{ fontSize: 28 }}
            />
          ) : undefined
        }
      >
        {/* The contact Rina saved back in March, still sitting in the chat. */}
        <DayDivider>12 Maret</DayDivider>
        <Shown at={0} from="me">
          <BigBubble from="me">
            Simpan nomor tukang AC: {JOKO.name}, {JOKO.phone}
          </BigBubble>
        </Shown>
        <Shown at={0} from="sydia">
          <BigBubble from="sydia" style={{ width: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Avatar initials={JOKO.initials} size={64} />
              <div>
                <div style={{ fontWeight: 700 }}>Tersimpan: {JOKO.name}</div>
                <div style={{ marginTop: 8 }}>
                  <AliasChip label={`Alias · ${JOKO.alias}`} />
                </div>
              </div>
            </div>
          </BigBubble>
        </Shown>
        <DayDivider>Hari ini</DayDivider>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{MESSAGE}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.25 && t < SEARCH_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        {t >= SEARCH_AT ? (
          <Pop
            at={SEARCH_AT}
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
              Mencari kontak “tukang AC”
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
