import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Typewriter } from "../../components/Anim";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { KkSample, KtpSample, PhotoBubble, Shown } from "../parts";
import { KTP_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["ask-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 1.0;
const REPLY_VO = REPLY_AT + 0.1;
const KK_AT = spokenAt("reply-sydia", REPLY_VO, 3);

export const ASK_SECONDS = REPLY_VO + LINES["reply-sydia"].duration + 0.7;

const MESSAGE = KTP_SCRIPT[3].text;

export const PHOTO_WIDTH = 380;
export const KK_CAPTION = "KTP dan KK Anda, siap diunggah.";

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
        <DayDivider>Maret</DayDivider>
        <BigBubble from="me">Simpan foto KTP sama KK aku, ya.</BigBubble>
        <BigBubble from="sydia">
          Sudah saya simpan. Tinggal minta kapan saja.
        </BigBubble>
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
          <PhotoBubble from="sydia">
            <KtpSample width={PHOTO_WIDTH} />
          </PhotoBubble>
        </Shown>
        <Shown at={KK_AT} from="sydia">
          <PhotoBubble from="sydia" caption={KK_CAPTION}>
            <KkSample width={PHOTO_WIDTH} />
          </PhotoBubble>
        </Shown>
      </ChatCard>

      <Caption id="ask-rina" at={TYPE_AT} speaker="rina" />
      <Caption id="reply-sydia" at={REPLY_VO} speaker="sydia" />

      <Line id="ask-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={REPLY_AT} />
      <Sfx kind="received" at={KK_AT} />
      <Line id="reply-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
