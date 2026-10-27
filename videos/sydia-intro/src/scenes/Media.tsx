import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Pop, Rise } from "../components/Anim";
import { SyncedWords } from "../components/SyncedWords";
import { Card, GradientText, Icon, Logo } from "../components/Ui";
import { COLORS, EASE_IN_OUT, FONT, wordAt } from "../theme";

const VoiceNote = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        background: "#d9fdd3",
        borderRadius: 30,
        padding: "26px 30px",
        display: "flex",
        alignItems: "center",
        gap: 22,
        width: 430,
        boxShadow: "rgba(23,20,25,0.10) 0 20px 40px -20px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          background: "#1fa855",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="play" size={30} color="#fff" />
      </div>
      <div
        style={{
          display: "flex",
          gap: 5,
          alignItems: "center",
          height: 60,
          flex: 1,
        }}
      >
        {Array.from({ length: 26 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              borderRadius: 3,
              background: "#3c8c5a",
              height:
                12 +
                Math.abs(Math.sin(i * 1.7 + frame / 5)) *
                  40 *
                  (0.5 + ((i * 7) % 5) / 8),
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 24, color: "#3c6e4e", fontWeight: 600 }}>
        0:08
      </div>
    </div>
  );
};

const Receipt = () => (
  <div
    style={{
      width: 300,
      background: COLORS.surface,
      borderRadius: 18,
      padding: "28px 30px",
      rotate: "-4deg",
      boxShadow: "rgba(23,20,25,0.14) 0 24px 50px -20px",
      fontFamily: "monospace",
      fontSize: 20,
      color: COLORS.ink,
      border: `1.5px solid ${COLORS.border}`,
    }}
  >
    <div
      style={{
        textAlign: "center",
        fontWeight: 700,
        fontSize: 22,
        marginBottom: 14,
      }}
    >
      TOKO SERBA ADA
    </div>
    {[
      ["Beras 5kg", "78.000"],
      ["Minyak 2L", "38.000"],
      ["Telur 1kg", "29.000"],
      ["Sabun", "41.000"],
    ].map(([a, b]) => (
      <div
        key={a}
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span>{a}</span>
        <span>{b}</span>
      </div>
    ))}
    <div
      style={{
        borderTop: "2px dashed rgba(23,20,25,0.25)",
        marginTop: 10,
        paddingTop: 10,
        display: "flex",
        justifyContent: "space-between",
        fontWeight: 700,
      }}
    >
      <span>TOTAL</span>
      <span>186.000</span>
    </div>
  </div>
);

const Pdf = () => (
  <Card
    style={{
      width: 430,
      padding: 28,
      display: "flex",
      alignItems: "center",
      gap: 22,
    }}
  >
    <div
      style={{
        width: 76,
        height: 92,
        borderRadius: 14,
        background: "#ffe3ec",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        fontWeight: 800,
        color: COLORS.accent,
      }}
    >
      PDF
    </div>
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.ink }}>
        Invoice_Oktober.pdf
      </div>
      <div style={{ fontSize: 24, color: COLORS.muted, marginTop: 6 }}>
        2 halaman
      </div>
    </div>
  </Card>
);

const Understood = ({
  at,
  children,
}: {
  readonly at: number;
  readonly children: React.ReactNode;
}) => (
  <Rise at={at} distance={50}>
    <Card
      style={{
        width: 430,
        padding: "26px 28px",
        display: "flex",
        gap: 18,
        alignItems: "flex-start",
      }}
    >
      <Logo size={44} />
      <div
        style={{
          fontSize: 28,
          lineHeight: 1.35,
          color: COLORS.ink,
          fontWeight: 500,
        }}
      >
        {children}
      </div>
    </Card>
  </Rise>
);

export const Media = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const getsAt = wordAt("media", 8);
  const swap = interpolate(
    frame,
    [(getsAt - 0.15) * fps, (getsAt + 0.3) * fps],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_IN_OUT,
    },
  );
  const headline: React.CSSProperties = {
    fontSize: 96,
    fontWeight: 700,
    letterSpacing: "-0.045em",
    justifyContent: "center",
    whiteSpace: "nowrap",
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 120 }}>
        <div style={{ position: "relative" }}>
          <div style={{ opacity: 1 - swap }}>
            <SyncedWords
              scene="media"
              from={0}
              to={1}
              style={{ ...headline, fontSize: 52, color: COLORS.muted }}
            />
            <SyncedWords scene="media" from={2} to={7} style={headline} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              justifyContent: "center",
              opacity: swap,
              translate: `0px ${(1 - swap) * 30}px`,
              ...headline,
            }}
          >
            Sydia&nbsp;<GradientText>paham</GradientText>&nbsp;isinya.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 50,
          paddingTop: 420,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
          }}
        >
          <div style={{ height: 230, display: "flex", alignItems: "center" }}>
            <Pop at={wordAt("media", 3) - 0.1}>
              <VoiceNote />
            </Pop>
          </div>
          <Understood at={getsAt + 0.05}>
            Tugas baru: <b>Ambil jas di laundry</b>, besok sore.
          </Understood>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
          }}
        >
          <div style={{ height: 230, display: "flex", alignItems: "center" }}>
            <Pop at={wordAt("media", 5) - 0.1}>
              <Receipt />
            </Pop>
          </div>
          <Understood at={getsAt + 0.2}>
            Belanja bulanan <b>Rp186.000</b> sudah dicatat.
          </Understood>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
          }}
        >
          <div style={{ height: 230, display: "flex", alignItems: "center" }}>
            <Pop at={wordAt("media", 7) - 0.1}>
              <Pdf />
            </Pop>
          </div>
          <Understood at={getsAt + 0.35}>
            Tagihan <b>Rp2.400.000</b>, jatuh tempo 5 Nov. Pengingat sudah
            dipasang.
          </Understood>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
