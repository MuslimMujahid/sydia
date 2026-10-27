import { AbsoluteFill } from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, Sfx } from "../../tiktok/parts";
import { MeetLinkCard } from "../link";
import { MEET_LINK, Shown, StatusRow, TimeGap } from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

// The earlier reply is already on screen; the follow-up arrives on its own.
const GAP_AT = 0.3;
const PUSH_AT = GAP_AT + 0.45;
const VO_AT = PUSH_AT + 0.15;
// The link card lands on "Link Google Meet", the join button on "siap", and
// the confirmation that Pak Budi has the invitation on his name.
const LINK_AT = VO_AT + 0.15;
const BUTTON_AT = spokenAt("ready-sydia", VO_AT, 4) - 0.1; // "siap."
const INVITE_AT = spokenAt("ready-sydia", VO_AT, 5) - 0.15; // "Pak"

const THANKS_AT = VO_AT + LINES["ready-sydia"].duration + 0.35;

export const READY_SECONDS = THANKS_AT + LINES["thanks-rina"].duration + 0.9;

export const Ready = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.2} />
    <ChatCard>
      {/* The tail of the first reply, so the push reads as a second message. */}
      <Shown at={0} from="sydia">
        <BigBubble from="sydia" style={{ width: 576 }}>
          <div style={{ color: COLORS.muted }}>
            Undangan sudah saya kirim ke email Pak Budi.
          </div>
          <div style={{ marginTop: 14 }}>
            <StatusRow
              at={0}
              state="pending"
              label="Link Google Meet sedang dibuat…"
            />
          </div>
        </BigBubble>
      </Shown>

      <TimeGap at={GAP_AT}>beberapa detik kemudian</TimeGap>

      <Shown at={PUSH_AT} from="sydia">
        <BigBubble from="sydia" style={{ width: 640 }}>
          <div style={{ fontWeight: 700, lineHeight: 1.35 }}>
            Link Google Meet untuk “Call dengan Pak Budi” sudah siap:{" "}
            <span style={{ color: COLORS.accent }}>{MEET_LINK}</span>
          </div>
          <MeetLinkCard at={LINK_AT} buttonAt={BUTTON_AT} />
          {/* Google delivered the invitation to his saved email, so the
              follow-up confirms it in the same receipt. */}
          <div style={{ marginTop: 16, minHeight: 50 }}>
            <StatusRow
              at={INVITE_AT}
              state="done"
              label="Pak Budi sudah dapat undangannya"
            />
          </div>
        </BigBubble>
      </Shown>
    </ChatCard>

    <Caption id="ready-sydia" at={VO_AT} speaker="sydia" />
    <Caption id="thanks-rina" at={THANKS_AT} speaker="rina" />

    <Sfx kind="received" at={PUSH_AT} />
    <Line id="ready-sydia" at={VO_AT} />
    <Line id="thanks-rina" at={THANKS_AT} />
  </AbsoluteFill>
);
