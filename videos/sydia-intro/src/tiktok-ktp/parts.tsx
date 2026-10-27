import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS, GRADIENT } from "../theme";
import { BigBubble, SAFE, SAFE_WIDTH } from "../tiktok/parts";

// Pops a chat bubble in at `at` seconds, anchored to its side of the chat.
export const Shown = ({
  at,
  from,
  children,
}: {
  readonly at: number;
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  return (
    <Pop
      at={at}
      style={{
        alignSelf: from === "me" ? "flex-end" : "flex-start",
        transformOrigin: from === "me" ? "right bottom" : "left bottom",
      }}
    >
      {children}
    </Pop>
  );
};

// Gray placeholder bar standing in for a line of printed text.
const Bar = ({
  w,
  h,
  color = "rgba(23,20,25,0.14)",
}: {
  readonly w: number;
  readonly h: number;
  readonly color?: string;
}) => (
  <div
    style={{ width: w, height: h, borderRadius: h / 2, background: color }}
  />
);

// An illustrated KTP: masked NIK, placeholder bars and a drawn avatar. It must
// read as a sample, never as a real ID, so there is no emblem or official layout.
export const KtpSample = ({ width }: { readonly width: number }) => {
  const u = width / 400;
  const ink = "#1d4a80";
  return (
    <div
      style={{
        width,
        height: 252 * u,
        borderRadius: 18 * u,
        background:
          "radial-gradient(circle at 85% 15%, rgba(255,255,255,0.7), transparent 45%), linear-gradient(135deg, #d9eafd 0%, #b5d2f3 100%)",
        padding: `${22 * u}px ${24 * u}px`,
        display: "flex",
        gap: 20 * u,
        color: ink,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 9 * u,
        }}
      >
        <div
          style={{
            fontSize: 30 * u,
            fontWeight: 800,
            letterSpacing: "0.04em",
            marginBottom: 4 * u,
          }}
        >
          KTP
        </div>
        <div style={{ fontSize: 12 * u, fontWeight: 600, opacity: 0.6 }}>
          NIK
        </div>
        <div
          style={{
            fontSize: 19 * u,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          3174 •••• •••• 0001
        </div>
        <div style={{ fontSize: 12 * u, fontWeight: 600, opacity: 0.6 }}>
          Nama
        </div>
        <div style={{ fontSize: 19 * u, fontWeight: 700 }}>RINA</div>
        <Bar w={190 * u} h={9 * u} color="rgba(29,74,128,0.2)" />
        <Bar w={150 * u} h={9 * u} color="rgba(29,74,128,0.2)" />
      </div>
      <div
        style={{
          width: 100 * u,
          height: 126 * u,
          marginTop: 46 * u,
          borderRadius: 12 * u,
          background: "rgba(255,255,255,0.65)",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 32 * u,
            top: 26 * u,
            width: 36 * u,
            height: 36 * u,
            borderRadius: 18 * u,
            background: "#8db1dc",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 16 * u,
            top: 70 * u,
            width: 68 * u,
            height: 70 * u,
            borderRadius: 34 * u,
            background: "#8db1dc",
          }}
        />
      </div>
    </div>
  );
};

// An illustrated KK: a masked family number and a table of placeholder rows.
export const KkSample = ({ width }: { readonly width: number }) => {
  const u = width / 400;
  const ink = "#2c6640";
  const cols = [70, 90, 60, 70];
  return (
    <div
      style={{
        width,
        height: 252 * u,
        borderRadius: 18 * u,
        background: "linear-gradient(180deg, #f6faf1 0%, #e6f1df 100%)",
        padding: `${20 * u}px ${24 * u}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: ink,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{ fontSize: 22 * u, fontWeight: 800, letterSpacing: "0.05em" }}
      >
        KARTU KELUARGA
      </div>
      <div
        style={{
          fontSize: 15 * u,
          fontWeight: 600,
          marginTop: 4 * u,
          fontVariantNumeric: "tabular-nums",
          opacity: 0.8,
        }}
      >
        No. 3174 •••• •••• 0002
      </div>
      <div
        style={{
          marginTop: 16 * u,
          width: "100%",
          borderRadius: 10 * u,
          overflow: "hidden",
          border: `${1.5 * u}px solid rgba(44,102,64,0.18)`,
        }}
      >
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14 * u,
              height: 30 * u,
              padding: `0 ${12 * u}px`,
              background:
                row === 0 ? "rgba(44,102,64,0.16)" : "rgba(255,255,255,0.6)",
              borderTop:
                row === 0 ? "none" : `${1.5 * u}px solid rgba(44,102,64,0.1)`,
            }}
          >
            {row === 1 ? (
              <div
                style={{
                  width: cols[0] * u,
                  fontSize: 13 * u,
                  fontWeight: 700,
                }}
              >
                RINA
              </div>
            ) : (
              <Bar
                w={(cols[0] - 10) * u}
                h={8 * u}
                color={
                  row === 0 ? "rgba(44,102,64,0.35)" : "rgba(23,20,25,0.14)"
                }
              />
            )}
            {cols.slice(1).map((w, i) => (
              <Bar
                key={i}
                w={(w - ((row + i) % 3) * 8) * u}
                h={8 * u}
                color={
                  row === 0 ? "rgba(44,102,64,0.35)" : "rgba(23,20,25,0.14)"
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// An image message in the chat, with an optional caption underneath.
export const PhotoBubble = ({
  from,
  children,
  caption,
}: {
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
  readonly caption?: string;
}) => (
  <BigBubble from={from} style={{ padding: 7 }}>
    <div style={{ borderRadius: 20, overflow: "hidden" }}>{children}</div>
    {caption ? (
      <div style={{ padding: "8px 14px 4px", maxWidth: 380 }}>{caption}</div>
    ) : null}
  </BigBubble>
);

export const SLOT_WIDTH = (SAFE_WIDTH - 80 - 24) / 2;
const SLOT_HEIGHT = 238;

// One upload field of the form: dashed and empty, or holding the uploaded photo.
export const UploadSlot = ({
  label,
  glow = 0,
  children,
  done,
}: {
  readonly label: string;
  readonly glow?: number;
  readonly children?: React.ReactNode;
  readonly done?: boolean;
}) => (
  <div style={{ width: SLOT_WIDTH }}>
    <div
      style={{
        fontSize: 28,
        fontWeight: 600,
        color: COLORS.muted,
        marginBottom: 12,
      }}
    >
      {label}
    </div>
    <div
      style={{
        height: SLOT_HEIGHT,
        borderRadius: 24,
        border: children
          ? `3px solid transparent`
          : `3px dashed ${glow > 0.5 ? COLORS.accent : "rgba(23,20,25,0.18)"}`,
        background: glow > 0.5 && !children ? "#fff3ee" : "#faf8f6",
        scale: String(1 + 0.04 * Math.sin(Math.PI * Math.min(glow, 1))),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        boxSizing: "border-box",
      }}
    >
      {children ?? (
        <>
          <Icon
            name="image"
            size={56}
            color={glow > 0.5 ? COLORS.accent : "#a39da7"}
          />
          <div style={{ fontSize: 24, color: COLORS.muted, fontWeight: 500 }}>
            Ketuk untuk unggah
          </div>
        </>
      )}
    </div>
    <div
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 24,
        fontWeight: 600,
        color: COLORS.accent,
        opacity: done ? 1 : 0,
      }}
    >
      <Icon name="check" size={28} color={COLORS.accent} />
      Terunggah
    </div>
  </div>
);

// A bank-style "open an account" form in the same box as the chat card.
export const FormCard = ({
  ktp,
  kk,
  ready,
  pressed,
  overlay,
  style,
}: {
  readonly ktp: React.ReactNode;
  readonly kk: React.ReactNode;
  readonly ready?: boolean;
  readonly pressed?: number;
  readonly overlay?: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
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
      ...style,
    }}
  >
    <div
      style={{
        height: "100%",
        padding: "44px 40px 40px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em" }}>
        Buka Rekening
      </div>
      <div style={{ fontSize: 28, color: COLORS.muted, marginTop: 6 }}>
        Lengkapi dokumen untuk lanjut
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: COLORS.muted,
          marginTop: 44,
          marginBottom: 12,
        }}
      >
        Nama lengkap
      </div>
      <div
        style={{
          height: 84,
          borderRadius: 22,
          background: "#faf8f6",
          border: `2px solid ${COLORS.hairline}`,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          fontSize: 32,
          fontWeight: 500,
        }}
      >
        Rina
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 36 }}>
        {ktp}
        {kk}
      </div>
      <div
        style={{
          marginTop: "auto",
          height: 104,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          fontWeight: 700,
          color: ready ? "#fff" : "#a39da7",
          background: ready ? GRADIENT : "#efebe7",
          scale: String(1 - 0.05 * (pressed ?? 0)),
          boxShadow: ready
            ? "rgba(240,102,148,0.35) 0 20px 40px -18px"
            : undefined,
        }}
      >
        Kirim
      </div>
    </div>
    {overlay}
  </div>
);
