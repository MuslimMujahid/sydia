import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, Sfx } from "../../tiktok/parts";
import { TypingDots } from "../../scenes/Chat";
import { InviteCard, SARAH } from "../invite";
import { EventCard, PhotoBubble, Shown } from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const REPLY_AT = 0.3;
const REPLY_VO = REPLY_AT + 0.1;
// Each row of the event card lands on the words that name it.
const COUPLE_AT = REPLY_VO + 0.05;
const DATE_AT = spokenAt("reply-sydia", REPLY_VO, 3);
const TIME_AT = spokenAt("reply-sydia", REPLY_VO, 6);
const PLACE_AT = spokenAt("reply-sydia", REPLY_VO, 10);

export const READ_SECONDS = REPLY_VO + LINES["reply-sydia"].duration + 0.8;

export const Read = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />
      <ChatCard>
        {/* Same width as the sent photo, so the fade between scenes keeps its size. */}
        <PhotoBubble from="me">
          <InviteCard invite={SARAH} width={340} />
        </PhotoBubble>
        {t < REPLY_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={REPLY_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700 }}>Undangannya sudah saya baca.</div>
            <EventCard
              at={COUPLE_AT}
              title="Nikahan Sarah &amp; Bagas"
              rows={[
                {
                  at: DATE_AT,
                  icon: "calendar",
                  label: "Tanggal",
                  value: "Sabtu, 7 November 2026",
                },
                {
                  at: TIME_AT,
                  icon: "clock",
                  label: "Jam",
                  value: "11.00 WIB",
                },
                {
                  at: PLACE_AT,
                  icon: "home",
                  label: "Tempat",
                  value: "Graha Cakrawala",
                },
              ]}
            />
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="reply-sydia" at={REPLY_VO} speaker="sydia" />

      <Sfx kind="received" at={REPLY_AT} />
      <Line id="reply-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
