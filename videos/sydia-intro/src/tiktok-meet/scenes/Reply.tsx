import { AbsoluteFill } from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { BigBubble, ChatCard, Sfx } from "../../tiktok/parts";
import { EventReceipt } from "../receipt";
import { Shown } from "../parts";
import { MEET_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const REPLY_AT = 0.3;
const VO_AT = REPLY_AT + 0.1;
// Each part of the receipt lands on the words that name it: the schedule under
// "Siap", the contact on "email Pak Budi", the sent invitation on "kirim", and
// the pending link on "Link Meet-nya sedang dibuat".
const WHEN_AT = VO_AT + 0.15;
const SENT_AT = spokenAt("reply-sydia", VO_AT, 4) - 0.2; // "kirim"
const CONTACT_AT = spokenAt("reply-sydia", VO_AT, 6) - 0.2; // "email"
const PENDING_AT = spokenAt("reply-sydia", VO_AT, 9) - 0.15; // "Link"

export const REPLY_SECONDS = VO_AT + LINES["reply-sydia"].duration + 1.0;

const MESSAGE = MEET_SCRIPT[1].text;

export const Reply = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.2} />
    <ChatCard>
      {/* Rina's request from the scene before, so the thread is continuous. */}
      <Shown at={0} from="me">
        <BigBubble from="me">{MESSAGE}</BigBubble>
      </Shown>
      <Shown at={REPLY_AT} from="sydia">
        <BigBubble from="sydia" style={{ width: 640 }}>
          <div style={{ fontWeight: 700 }}>
            Siap. Undangan sudah saya kirim ke email Pak Budi.
          </div>
          <EventReceipt
            at={REPLY_AT + 0.2}
            whenAt={WHEN_AT}
            contactAt={CONTACT_AT}
            sentAt={SENT_AT}
            pendingAt={PENDING_AT}
          />
        </BigBubble>
      </Shown>
    </ChatCard>

    <Caption id="reply-sydia" at={VO_AT} speaker="sydia" />

    <Sfx kind="received" at={REPLY_AT} />
    <Line id="reply-sydia" at={VO_AT} />
  </AbsoluteFill>
);
