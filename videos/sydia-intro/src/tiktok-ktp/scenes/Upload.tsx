import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { COLORS, EASE_OUT, FONT, GRADIENT } from "../../theme";
import {
  FormCard,
  KkSample,
  KtpSample,
  SLOT_WIDTH,
  UploadSlot,
} from "../parts";
import { Caption, Line, LINES, spokenAt } from "../voice";

const VO_AT = 0.4;
const KTP_AT = spokenAt("upload-rina", VO_AT, 1) - 0.1;
const KK_AT = KTP_AT + 0.3;
// Rina taps Kirim after "beres!", so the filled fields stay on screen for a beat.
const PRESS_AT = spokenAt("upload-rina", VO_AT, 3) - 0.3;
const SENT_AT = PRESS_AT + 0.3;

export const UPLOAD_SECONDS = VO_AT + LINES["upload-rina"].duration + 0.6;

const Filled = ({
  at,
  children,
}: {
  readonly at: number;
  readonly children: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  return <Pop at={at}>{children}</Pop>;
};

// The form's thank-you screen, covering the card once Rina taps Kirim.
const Sent = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < SENT_AT) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: COLORS.surface,
        opacity: interpolate(t, [SENT_AT, SENT_AT + 0.25], [0, 1], {
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 60px",
      }}
    >
      <Pop at={SENT_AT + 0.1}>
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundImage: GRADIENT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "rgba(240,102,148,0.35) 0 24px 50px -18px",
          }}
        >
          <Icon name="check" size={110} color="#fff" />
        </div>
      </Pop>
      <Rise at={SENT_AT + 0.25} style={{ marginTop: 56 }}>
        <div
          style={{ fontSize: 60, fontWeight: 800, letterSpacing: "-0.03em" }}
        >
          Formulir terkirim
        </div>
        <div style={{ fontSize: 32, color: COLORS.muted, marginTop: 14 }}>
          Dokumen lengkap. Terima kasih, Rina.
        </div>
      </Rise>
    </div>
  );
};

export const Upload = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pressed = interpolate(
    t,
    [PRESS_AT, PRESS_AT + 0.1, PRESS_AT + 0.25],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const photo = SLOT_WIDTH - 24;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />
      <FormCard
        ktp={
          <UploadSlot label="Foto KTP" done={t >= KTP_AT + 0.2}>
            {t >= KTP_AT ? (
              <Filled at={KTP_AT}>
                <KtpSample width={photo} />
              </Filled>
            ) : null}
          </UploadSlot>
        }
        kk={
          <UploadSlot label="Foto KK" done={t >= KK_AT + 0.2}>
            {t >= KK_AT ? (
              <Filled at={KK_AT}>
                <KkSample width={photo} />
              </Filled>
            ) : null}
          </UploadSlot>
        }
        ready={t >= KK_AT + 0.2}
        pressed={pressed}
        overlay={<Sent />}
      />

      <Caption id="upload-rina" at={VO_AT} speaker="rina" />
      <Line id="upload-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
