import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Aurora } from "../../components/Aurora";
import { Rise, Typewriter } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, Sfx } from "../../tiktok/parts";
import { KkSample, KtpSample, PhotoBubble, Shown } from "../parts";
import { KTP_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";
import { KK_CAPTION, PHOTO_WIDTH } from "./Ask";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["thanks-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 0.8;
const REPLY_VO = REPLY_AT + 0.1;

export const THANKS_SECONDS = REPLY_VO + LINES["thanks-sydia"].duration + 0.6;

const MESSAGE = KTP_SCRIPT[6].text;

// One more document Sydia keeps for Rina, listed in the reply.
const DocRow = ({
  title,
  kind,
  at,
  first,
}: {
  readonly title: string;
  readonly kind: string;
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
          <Icon name="file" size={32} color={COLORS.accent} />
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 26, color: COLORS.muted }}>{kind}</div>
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
        <PhotoBubble from="sydia">
          <KtpSample width={PHOTO_WIDTH} />
        </PhotoBubble>
        <PhotoBubble from="sydia" caption={KK_CAPTION}>
          <KkSample width={PHOTO_WIDTH} />
        </PhotoBubble>
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
            <div style={{ marginBottom: 4 }}>
              Ini juga saya simpan, kalau nanti dibutuhkan:
            </div>
            <DocRow
              first
              title="Akta kelahiran"
              kind="PDF"
              at={spokenAt("thanks-sydia", REPLY_VO, 2)}
            />
            <DocRow
              title="NPWP"
              kind="Foto"
              at={spokenAt("thanks-sydia", REPLY_VO, 5)}
            />
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
