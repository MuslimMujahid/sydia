import { AbsoluteFill } from "remotion";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { Timeline } from "../note";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.4;
const SYDIA_AT = VO_AT + LINES["minta-rina"].duration + 0.3;
// The August note and today are already there; the reminder lands on the date.
const REMIND_AT = spokenAt("ingat-sydia", SYDIA_AT, 4) - 0.2; // "dua puluh tujuh"

export const REMIND_SECONDS = SYDIA_AT + LINES["ingat-sydia"].duration + 0.7;

export const Remind = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.25} />
    <Timeline
      stops={[
        {
          at: 0,
          kind: "note",
          date: "27 Agu 2026",
          title: "Ganti oli",
          detail: "23.400 km · Pak Budi",
        },
        {
          at: 0.15,
          kind: "now",
          date: "Hari ini · 27 Okt",
          title: "Di bengkel",
          detail: "27.900 km",
        },
        {
          at: REMIND_AT,
          kind: "reminder",
          date: "2 bulan lagi · 27 Des 2026",
          title: "Ingatkan ganti oli",
          detail: "Pengingat aktif",
        },
      ]}
    />

    <Caption id="minta-rina" at={VO_AT} speaker="rina" />
    <Caption id="ingat-sydia" at={SYDIA_AT} speaker="sydia" />

    <Line id="minta-rina" at={VO_AT} />
    <Line id="ingat-sydia" at={SYDIA_AT} />
  </AbsoluteFill>
);
