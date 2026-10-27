import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { COLORS } from "../theme";
import { CamGlyph, MEET_GREEN, MEET_LINK } from "./parts";

// The finished link, plus the button Rina taps to join. Sydia never joins the
// call; this button is Rina's.
export const MeetLinkCard = ({
  at,
  buttonAt,
}: {
  readonly at: number;
  readonly buttonAt: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < at) return null;
  return (
    <Rise at={at} distance={20} blur={false} style={{ marginTop: 14 }}>
      <div
        style={{
          width: 576,
          borderRadius: 26,
          background: "#f2f8f4",
          border: `2px solid ${MEET_GREEN}33`,
          padding: "24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Pop at={at + 0.1}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 17,
                background: "#e3f1e8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CamGlyph size={30} />
            </div>
          </Pop>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 600, color: COLORS.muted }}>
              Link rapat
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: MEET_GREEN,
                letterSpacing: "-0.01em",
              }}
            >
              {MEET_LINK}
            </div>
          </div>
        </div>

        <div style={{ minHeight: 86 }}>
          {t >= buttonAt ? (
            <Pop at={buttonAt} style={{ transformOrigin: "left center" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "20px 36px",
                  borderRadius: 999,
                  background: MEET_GREEN,
                  color: "#fff",
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  whiteSpace: "nowrap",
                  boxShadow: "rgba(26,138,76,0.4) 0 18px 38px -14px",
                }}
              >
                <CamGlyph size={28} color="#fff" />
                Gabung Google Meet
              </div>
            </Pop>
          ) : null}
        </div>
      </div>
    </Rise>
  );
};
