import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../components/Aurora";
import { Rise } from "../components/Anim";
import { GradientText, Icon, Logo } from "../components/Ui";
import {
  CARD_SHADOW,
  COLORS,
  EASE_IN_OUT,
  EASE_OUT,
  FONT,
  wordAt,
} from "../theme";

type IconName = React.ComponentProps<typeof Icon>["name"];

const NAV: { label: string; icon: IconName }[] = [
  { label: "Hari ini", icon: "home" },
  { label: "Chat", icon: "chat" },
  { label: "Tugas", icon: "check" },
  { label: "Pengingat", icon: "bell" },
  { label: "Kalender", icon: "calendar" },
  { label: "Memori", icon: "brain" },
  { label: "File", icon: "file" },
  { label: "Kontak", icon: "users" },
];

// Which nav item is open from which moment, following the voiceover.
const STOPS = [
  { nav: 0, at: 0 },
  { nav: 2, at: wordAt("dashboard", 7) },
  { nav: 4, at: wordAt("dashboard", 8) },
  { nav: 5, at: wordAt("dashboard", 9) },
  { nav: 6, at: wordAt("dashboard", 11) },
];

const NAV_ROW = 64;

const Row = ({
  children,
  style,
}: {
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      padding: "20px 24px",
      borderRadius: 18,
      background: COLORS.surface,
      border: `1.5px solid ${COLORS.border}`,
      fontSize: 26,
      ...style,
    }}
  >
    {children}
  </div>
);

const Checkbox = ({ done }: { readonly done?: boolean }) => (
  <div
    style={{
      width: 30,
      height: 30,
      borderRadius: 9,
      border: done ? "none" : "2.5px solid rgba(23,20,25,0.22)",
      background: done ? COLORS.accent : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {done ? <Icon name="check" size={22} color="#fff" /> : null}
  </div>
);

const Title = ({ children }: { readonly children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 44,
      fontWeight: 700,
      letterSpacing: "-0.03em",
      marginBottom: 26,
    }}
  >
    {children}
  </div>
);

const PANELS: React.ReactNode[] = [
  <div key="today">
    <Title>Selamat pagi, Rina</Title>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Row>
        <Icon name="calendar" size={28} color={COLORS.accent} />
        10.00 Rapat tim mingguan
      </Row>
      <Row>
        <Checkbox />
        Kirim proposal ke Pak Budi
      </Row>
      <Row>
        <Icon name="bell" size={28} color={COLORS.accent} />
        Bayar listrik
      </Row>
    </div>
  </div>,
  null,
  <div key="tasks">
    <Title>Tugas</Title>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[
        ["Kirim proposal ke Pak Budi", false],
        ["Ambil jas di laundry", false],
        ["Perpanjang SIM", false],
        ["Beli kado ulang tahun Dina", true],
      ].map(([t, done]) => (
        <Row
          key={t as string}
          style={{ color: done ? COLORS.muted : COLORS.ink }}
        >
          <Checkbox done={done as boolean} />
          <span style={{ textDecoration: done ? "line-through" : "none" }}>
            {t}
          </span>
        </Row>
      ))}
    </div>
  </div>,
  null,
  <div key="calendar">
    <Title>Kalender</Title>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 12,
      }}
    >
      {["Sen", "Sel", "Rab", "Kam", "Jum"].map((d, i) => (
        <div
          key={d}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div style={{ fontSize: 22, color: COLORS.muted, fontWeight: 600 }}>
            {d}
          </div>
          <div
            style={{
              height: 300,
              borderRadius: 16,
              background: COLORS.surface,
              border: `1.5px solid ${COLORS.border}`,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {i === 0 || i === 3 ? (
              <div
                style={{
                  marginTop: i === 0 ? 20 : 120,
                  height: i === 0 ? 70 : 90,
                  borderRadius: 12,
                  background: i === 0 ? "#ffe9dc" : "#ede4ff",
                  padding: "8px 12px",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {i === 0 ? "Rapat tim" : "Meeting Pak Budi"}
              </div>
            ) : null}
            {i === 2 ? (
              <div
                style={{
                  marginTop: 60,
                  height: 60,
                  borderRadius: 12,
                  background: "#ffe3ec",
                  padding: "8px 12px",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                Bayar listrik
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  </div>,
  <div key="memory">
    <Title>Memori</Title>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {[
        ["Ukuran sepatu Dina", "38"],
        ["Golongan darah", "O"],
        ["Plat motor", "B 4512 KZT"],
        ["Dokter gigi langganan", "drg. Sari, Kemang"],
      ].map(([k, v]) => (
        <div
          key={k}
          style={{
            padding: "22px 24px",
            borderRadius: 18,
            background: COLORS.surface,
            border: `1.5px solid ${COLORS.border}`,
          }}
        >
          <div style={{ fontSize: 22, color: COLORS.muted }}>{k}</div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6 }}>{v}</div>
        </div>
      ))}
    </div>
  </div>,
  <div key="files">
    <Title>File</Title>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 14,
      }}
    >
      {[
        ["Invoice_Oktober.pdf", "#ffe3ec"],
        ["Kontrak_final_v3.pdf", "#ede4ff"],
        ["Struk_belanja.jpg", "#ffe9dc"],
        ["KTP_scan.jpg", "#ffe9dc"],
        ["Itinerary_Bali.pdf", "#ede4ff"],
        ["Catatan_rapat.docx", "#ffe3ec"],
      ].map(([name, tint]) => (
        <div
          key={name}
          style={{
            borderRadius: 18,
            background: COLORS.surface,
            border: `1.5px solid ${COLORS.border}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 90,
              background: tint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={name.endsWith(".jpg") ? "image" : "file"} size={40} />
          </div>
          <div style={{ padding: "14px 16px", fontSize: 20, fontWeight: 600 }}>
            {name}
          </div>
        </div>
      ))}
    </div>
  </div>,
];

const Window = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN_OUT,
  } as const;

  // Sidebar highlight glides between the items the voiceover names.
  let navPos = 0;
  STOPS.forEach((s, i) => {
    if (i === 0) return;
    navPos += interpolate(
      t,
      [s.at - 0.15, s.at + 0.2],
      [0, s.nav - STOPS[i - 1].nav],
      clamp,
    );
  });

  return (
    <div
      style={{
        width: 1560,
        height: 800,
        borderRadius: 30,
        background: COLORS.surface,
        boxShadow: CARD_SHADOW,
        border: `1.5px solid ${COLORS.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 24px",
          borderBottom: `1.5px solid ${COLORS.hairline}`,
        }}
      >
        {["#ff6058", "#ffbd2e", "#28c840"].map((c) => (
          <div
            key={c}
            style={{ width: 16, height: 16, borderRadius: 8, background: c }}
          />
        ))}
      </div>
      <div style={{ flex: 1, display: "flex" }}>
        <div
          style={{
            width: 330,
            padding: "30px 22px",
            borderRight: `1.5px solid ${COLORS.hairline}`,
            background: COLORS.canvas,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 34,
              paddingLeft: 12,
            }}
          >
            <Logo size={44} />
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.03em",
              }}
            >
              Sydia
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: navPos * NAV_ROW,
                height: NAV_ROW - 6,
                borderRadius: 16,
                background: COLORS.surface,
                boxShadow: "rgba(23,20,25,0.08) 0 6px 16px -6px",
                border: `1.5px solid ${COLORS.border}`,
              }}
            />
            {NAV.map((item, i) => {
              const active = Math.abs(navPos - i) < 0.5;
              return (
                <div
                  key={item.label}
                  style={{
                    position: "relative",
                    height: NAV_ROW,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    paddingLeft: 16,
                    marginTop: -3,
                    fontSize: 26,
                    fontWeight: active ? 700 : 500,
                    color: active ? COLORS.ink : COLORS.muted,
                  }}
                >
                  <Icon
                    name={item.icon}
                    size={28}
                    color={active ? COLORS.accent : COLORS.muted}
                  />
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, position: "relative", background: "#fdfcfb" }}>
          {STOPS.map((s, i) => {
            const end = STOPS[i + 1]?.at ?? 99;
            const opacity =
              interpolate(t, [s.at - 0.1, s.at + 0.2], [0, 1], clamp) *
              interpolate(t, [end - 0.1, end + 0.1], [1, 0], clamp);
            return (
              <div
                key={s.nav}
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "44px 56px",
                  opacity:
                    i === 0
                      ? interpolate(t, [end - 0.1, end + 0.1], [1, 0], clamp)
                      : opacity,
                  translate: `0px ${interpolate(t, [s.at - 0.1, s.at + 0.3], [i === 0 ? 0 : 24, 0], clamp)}px`,
                }}
              >
                {PANELS[s.nav]}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const Dashboard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tidyAt = wordAt("dashboard", 12);
  const clamp = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  const swap = interpolate(
    frame,
    [(tidyAt - 0.15) * fps, (tidyAt + 0.3) * fps],
    [0, 1],
    {
      ...clamp,
      easing: EASE_IN_OUT,
    },
  );
  const headline: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: 70,
    textAlign: "center",
    fontSize: 84,
    fontWeight: 700,
    letterSpacing: "-0.04em",
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora />
      <div style={{ ...headline, opacity: 1 - swap }}>
        <Rise at={0.2}>
          Mau lihat <GradientText>semuanya</GradientText> sekaligus?
        </Rise>
      </div>
      <div
        style={{
          ...headline,
          opacity: swap,
          translate: `0px ${(1 - swap) * 30}px`,
        }}
      >
        Rapi di <GradientText>satu tempat.</GradientText>
      </div>
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 40,
          perspective: 2400,
        }}
      >
        <div
          style={{
            translate: interpolate(
              frame,
              [0, 1.1 * fps],
              ["0px 500px", "0px 0px"],
              {
                ...clamp,
                easing: EASE_OUT,
              },
            ),
            rotate: `x ${interpolate(frame, [0, 1.4 * fps], [24, 0], { ...clamp, easing: EASE_OUT })}deg`,
            scale: interpolate(
              frame,
              [0, 1.1 * fps, tidyAt * fps, (tidyAt + 1) * fps],
              [0.9, 0.98, 0.98, 0.94],
              {
                ...clamp,
                easing: EASE_IN_OUT,
              },
            ),
            transformOrigin: "center bottom",
          }}
        >
          <Window />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
