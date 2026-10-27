import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Typewriter } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, Sfx } from "../../tiktok/parts";
import { DraftNote, Shown, SourceChip } from "../parts";
import { KOS_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["draft-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 0.6;
const REPLY_VO = REPLY_AT + 0.1;
// Rina taps Salin on "salin", and the button confirms a beat later.
const PRESS_AT = spokenAt("draft-sydia", REPLY_VO, 3) - 0.1;
const COPIED_AT = PRESS_AT + 0.22;

export const DRAFT_SECONDS = REPLY_VO + LINES["draft-sydia"].duration + 1.05;

const MESSAGE = KOS_SCRIPT[3].text;

// Sydia writes the text; Rina is the one who sends it, so the draft is quoted,
// not delivered.
const DRAFT =
  "Selamat pagi, Bu. Saya Rina, kamar 12. Saya menemukan anak kucing dan ingin merawatnya di kamar. Sesuai Pasal 7, saya mohon izin Ibu dulu. Terima kasih.";

export const Draft = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const press = interpolate(
    t,
    [PRESS_AT, PRESS_AT + 0.09, PRESS_AT + 0.22],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.1} />
      <ChatCard
        input={
          t >= TYPE_AT && t < SEND_AT ? (
            <Typewriter
              text={MESSAGE}
              at={TYPE_AT}
              cps={MESSAGE.length / (LINES["draft-rina"].duration - 0.2)}
              style={{ fontSize: 30 }}
            />
          ) : undefined
        }
      >
        {/* Sydia's answer from the scene before, so the chat is never empty. */}
        <Shown at={0} from="sydia">
          <BigBubble from="sydia" style={{ width: 600 }}>
            <div style={{ fontWeight: 700 }}>Pasal 7 — Hewan peliharaan</div>
            <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 31 }}>
              Boleh, asal izin pemilik kos dulu.
            </div>
            <div style={{ marginTop: 16 }}>
              <SourceChip label="Kontrak Kos 2026.pdf · hal. 3" />
            </div>
          </BigBubble>
        </Shown>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{MESSAGE}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.25 && t < REPLY_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={REPLY_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700 }}>
              Draf pesan untuk Ibu Kos. Salin dan kirim dari WhatsApp Anda.
            </div>
            <div style={{ marginTop: 16 }}>
              <DraftNote text={DRAFT} copied={t >= COPIED_AT} press={press} />
            </div>
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="draft-rina" at={TYPE_AT} speaker="rina" />
      <Caption id="draft-sydia" at={REPLY_VO} speaker="sydia" />

      <Line id="draft-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={REPLY_AT} />
      <Line id="draft-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
