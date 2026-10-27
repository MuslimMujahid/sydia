import { loadFont as loadHand } from "@remotion/google-fonts/Caveat";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS, GRADIENT } from "../theme";
import { SAFE, SAFE_WIDTH } from "../tiktok/parts";
import { Gauge, NoteChip } from "./parts";

// The note Rina wrote in August is handwriting, so it reads as hers; everything
// else in the video stays Inter.
export const { fontFamily: HAND } = loadHand("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});

// The daily note from 27 August, as Rina jotted it down that day.
export const DailyNote = ({
  at,
  width,
}: {
  readonly at: number;
  readonly width: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame / fps < at) return null;
  return (
    <Rise at={at} distance={20} blur={false}>
      <div
        style={{
          width,
          borderRadius: 24,
          background: "linear-gradient(170deg, #fffdf6 0%, #fff6e4 100%)",
          border: "2px solid rgba(23,20,25,0.08)",
          boxShadow: "rgba(23,20,25,0.10) 0 16px 32px -18px",
          padding: "20px 24px",
          boxSizing: "border-box",
          position: "relative",
          rotate: "-1.1deg",
        }}
      >
        {/* ruled line, like a pocket notebook */}
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 64,
            height: 2,
            background: "rgba(23,20,25,0.07)",
          }}
        />
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.muted,
            letterSpacing: "0.04em",
          }}
        >
          KAMIS, 27 AGUSTUS 2026
        </div>
        <div
          style={{
            fontFamily: HAND,
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 1.3,
            marginTop: 14,
            color: "#2c2436",
          }}
        >
          Ganti oli di Pak Budi, 23.400 km
        </div>
      </div>
    </Rise>
  );
};

type Stop = {
  readonly at: number;
  readonly date: string;
  readonly title: string;
  readonly detail?: string;
  readonly kind: "note" | "now" | "reminder";
};

const DOT = 64;

// Every stop holds its place from the first frame and fades in at `at`, so the
// list does not shift when the reminder arrives at the end.
const Stop = ({ at, date, title, detail, kind }: Stop) => {
  const reminder = kind === "reminder";
  return (
    <Rise at={at} distance={18} blur={false}>
      <div style={{ display: "flex", gap: 26, alignItems: "center" }}>
        <Pop at={at}>
          <div
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: reminder ? undefined : COLORS.surface,
              backgroundImage: reminder ? GRADIENT : undefined,
              border: reminder ? undefined : `3px solid ${COLORS.hairline}`,
              boxShadow: reminder
                ? "rgba(240,102,148,0.38) 0 14px 30px -10px"
                : undefined,
            }}
          >
            {kind === "note" ? (
              <Icon name="file" size={32} color={COLORS.accent} />
            ) : kind === "now" ? (
              <Gauge size={32} color={COLORS.muted} />
            ) : (
              <Icon name="bell" size={32} color="#fff" />
            )}
          </div>
        </Pop>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: reminder ? COLORS.accent : COLORS.muted,
            }}
          >
            {date}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, marginTop: 2 }}>
            {title}
          </div>
          {detail ? (
            <div style={{ fontSize: 25, color: COLORS.muted, marginTop: 4 }}>
              {detail}
            </div>
          ) : null}
        </div>
      </div>
    </Rise>
  );
};

// Rina's oil story on one line: the August note, today's visit, and the
// reminder Sydia just set for December.
export const Timeline = ({ stops }: { readonly stops: readonly Stop[] }) => (
  <div
    style={{
      position: "absolute",
      left: SAFE.left,
      top: 560,
      width: SAFE_WIDTH,
      height: 900,
      borderRadius: 48,
      overflow: "hidden",
      background: COLORS.surface,
      boxShadow:
        "rgba(23,20,25,0.16) 0 50px 100px -40px, rgba(23,20,25,0.08) 0 10px 30px -10px",
      border: `1.5px solid ${COLORS.border}`,
      padding: "46px 44px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em" }}>
      Oli motor Rina
    </div>
    <div style={{ fontSize: 26, color: COLORS.muted, marginTop: 6 }}>
      Dari catatan harian Anda
    </div>

    <div
      style={{
        position: "relative",
        marginTop: 44,
        // Centres the stops in the space between the header and the chip, so
        // the card has no void while the last stop is still to come.
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 44,
        }}
      >
        {/* the rail the stops sit on, behind their dots */}
        <div
          style={{
            position: "absolute",
            left: DOT / 2 - 2,
            top: 24,
            bottom: 24,
            width: 4,
            borderRadius: 2,
            background:
              "linear-gradient(180deg, rgba(23,20,25,0.10) 0%, rgba(239,90,138,0.45) 100%)",
          }}
        />
        {stops.map((stop) => (
          <Stop key={stop.title} {...stop} />
        ))}
      </div>
    </div>

    <div style={{ marginTop: "auto", display: "flex" }}>
      <NoteChip label="Catatan harian · 27 Agu" />
    </div>
  </div>
);
