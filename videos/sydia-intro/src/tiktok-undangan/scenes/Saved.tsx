import { AbsoluteFill } from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { CalendarCard } from "../calendar";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.4;
// The event lands on "kalender", the gift reminder on "ingatkan".
const WEDDING_AT = spokenAt("gift-sydia", VO_AT, 2) - 0.1;
const REMINDER_AT = spokenAt("gift-sydia", VO_AT, 8) - 0.15;
const THANKS_AT = VO_AT + LINES["gift-sydia"].duration + 0.45;

export const SAVED_SECONDS = THANKS_AT + LINES["thanks-rina"].duration + 0.9;

export const Saved = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.25} />
    <CalendarCard weddingAt={WEDDING_AT} reminderAt={REMINDER_AT} />

    <Caption id="gift-sydia" at={VO_AT} speaker="sydia" />
    <Caption id="thanks-rina" at={THANKS_AT} speaker="rina" />

    <Line id="gift-sydia" at={VO_AT} />
    <Line id="thanks-rina" at={THANKS_AT} />
  </AbsoluteFill>
);
