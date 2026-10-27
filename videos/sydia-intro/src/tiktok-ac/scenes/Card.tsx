import { AbsoluteFill } from "remotion";
import { Rise } from "../../components/Anim";
import { Aurora } from "../../components/Aurora";
import { COLORS, FONT } from "../../theme";
import { SAFE, SAFE_WIDTH, Sfx } from "../../tiktok/parts";
import { ContactCard } from "../contact";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.3;
// Each field lands on the words that name it: the name, the alias, the month,
// then the number as Sydia says she is sending it.
const NAME_AT = VO_AT + 0.05;
const ALIAS_AT = spokenAt("reply-sydia", VO_AT, 2) - 0.15;
const NOTE_AT = spokenAt("reply-sydia", VO_AT, 4) - 0.15;
const PHONE_AT = spokenAt("reply-sydia", VO_AT, 8) - 0.2;

export const CARD_SECONDS = VO_AT + LINES["reply-sydia"].duration + 0.9;

const TOP = 600;

export const Card = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
    <Aurora intensity={1.25} />
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        top: TOP,
        width: SAFE_WIDTH,
        height: SAFE.bottom - TOP,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Rise at={NAME_AT - 0.2} distance={26} blur={false}>
        <div
          style={{
            borderRadius: 40,
            background: COLORS.surface,
            border: `1.5px solid ${COLORS.border}`,
            boxShadow:
              "rgba(23,20,25,0.16) 0 50px 100px -40px, rgba(23,20,25,0.06) 0 4px 10px -4px",
            padding: 30,
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: COLORS.muted,
              letterSpacing: "0.04em",
              marginBottom: 20,
              paddingLeft: 6,
            }}
          >
            KONTAK TERSIMPAN
          </div>
          <ContactCard
            nameAt={NAME_AT}
            aliasAt={ALIAS_AT}
            phoneAt={PHONE_AT}
            noteAt={NOTE_AT}
          />
        </div>
      </Rise>
    </div>

    <Caption id="reply-sydia" at={VO_AT} speaker="sydia" />

    <Sfx kind="received" at={NAME_AT - 0.2} />
    <Line id="reply-sydia" at={VO_AT} />
  </AbsoluteFill>
);
