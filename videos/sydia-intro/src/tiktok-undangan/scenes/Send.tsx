import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { InviteCard, SARAH } from "../invite";
import { PhotoBubble, Shown } from "../parts";
import { Caption, Line, spokenAt } from "../voice";

const VO_AT = 0.4;
// The photo lands in the composer on "foto", and goes out on "kirim".
const ATTACH_AT = spokenAt("send-rina", VO_AT, 1) + 0.1;
const SEND_AT = spokenAt("send-rina", VO_AT, 3) + 0.25;
const READ_AT = SEND_AT + 0.75;

export const SEND_SECONDS = READ_AT + 1.5;

// Matches the photo in the next scene, so the fade between them does not resize it.
const PHOTO_W = 340;

// The attachment chip in the composer, standing in for a picked photo.
const Attached = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        background: "#f6ecd9",
      }}
    >
      <div style={{ scale: "0.153", transformOrigin: "top center" }}>
        <InviteCard invite={SARAH} width={PHOTO_W} />
      </div>
    </div>
    <span style={{ fontSize: 29 }}>Foto undangan</span>
  </div>
);

// Sydia reading the photo: a line sweeping down the image.
const Scan = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < READ_AT) return null;
  const y = interpolate(t, [READ_AT, READ_AT + 1.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 20,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${y * 100}%`,
          height: 130,
          translate: "0 -100%",
          background:
            "linear-gradient(180deg, rgba(239,90,138,0) 0%, rgba(239,90,138,0.1) 86%, rgba(239,90,138,0.7) 100%)",
        }}
      />
    </div>
  );
};

export const Send = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.15} />
      <ChatCard
        input={t >= ATTACH_AT && t < SEND_AT ? <Attached /> : undefined}
        button={t >= ATTACH_AT ? "send" : undefined}
      >
        <DayDivider>Hari ini</DayDivider>
        <Shown at={SEND_AT} from="me">
          <div style={{ position: "relative" }}>
            <PhotoBubble from="me">
              <InviteCard invite={SARAH} width={PHOTO_W} />
            </PhotoBubble>
            <Scan />
          </div>
        </Shown>
        {t >= READ_AT ? (
          <Pop
            at={READ_AT}
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
              <Icon name="image" size={30} color={COLORS.accent} />
              Membaca undangan
            </div>
          </Pop>
        ) : null}
      </ChatCard>

      <Caption id="send-rina" at={VO_AT} speaker="rina" />

      <Line id="send-rina" at={VO_AT} />
      <Sfx kind="sent" at={SEND_AT} />
    </AbsoluteFill>
  );
};
