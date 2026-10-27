import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS, GRADIENT } from "../theme";
import { SAFE, SAFE_WIDTH } from "../tiktok/parts";

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

export type CakeKind = "brownies" | "velvet";

// An illustrated cake tile, drawn with gradients and rounded blocks so the
// video needs no photography. Brownies carry visible peanuts; the red velvet
// is bare cream.
export const CakeArt = ({
  kind,
  width,
}: {
  readonly kind: CakeKind;
  readonly width: number;
}) => {
  const u = width / 170;
  const brownies = kind === "brownies";
  const px = (n: number) => n * u;
  return (
    <div
      style={{
        width,
        height: width,
        borderRadius: px(24),
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        background: brownies
          ? "radial-gradient(circle at 78% 16%, rgba(255,255,255,0.75), transparent 48%), linear-gradient(150deg, #f4e4d4 0%, #e0c3a6 100%)"
          : "radial-gradient(circle at 78% 16%, rgba(255,255,255,0.85), transparent 48%), linear-gradient(150deg, #ffe9ef 0%, #ffc8d8 100%)",
      }}
    >
      {/* plate */}
      <div
        style={{
          position: "absolute",
          left: px(16),
          right: px(16),
          bottom: px(18),
          height: px(11),
          borderRadius: px(6),
          background: "rgba(23,20,25,0.14)",
        }}
      />
      {/* body */}
      <div
        style={{
          position: "absolute",
          left: px(26),
          width: px(118),
          bottom: px(26),
          height: px(60),
          borderRadius: `${px(8)}px ${px(8)}px ${px(16)}px ${px(16)}px`,
          background: brownies
            ? "linear-gradient(180deg, #6d4128 0%, #46281a 100%)"
            : "linear-gradient(180deg, #c33350 0%, #8e1f33 100%)",
          overflow: "hidden",
        }}
      >
        {!brownies
          ? [0.3, 0.68].map((y) => (
              <div
                key={y}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${y * 100}%`,
                  height: px(8),
                  background: "rgba(255,252,248,0.9)",
                }}
              />
            ))
          : null}
      </div>
      {/* frosting */}
      <div
        style={{
          position: "absolute",
          left: px(21),
          width: px(128),
          bottom: px(80),
          height: px(26),
          borderRadius: px(13),
          background: brownies
            ? "linear-gradient(180deg, #8d5c3b 0%, #6f4529 100%)"
            : "linear-gradient(180deg, #fffdfb 0%, #ffeef3 100%)",
        }}
      />
      {/* toppings */}
      {(brownies ? [34, 62, 90, 118] : [38, 70, 102]).map((x, i) =>
        brownies ? (
          <div
            key={x}
            style={{
              position: "absolute",
              left: px(x),
              bottom: px(92 + (i % 2) * 7),
              width: px(18),
              height: px(13),
              borderRadius: "50%",
              background: "linear-gradient(140deg, #e2b377, #c2874a)",
              boxShadow: `inset 0 ${px(-2)}px 0 rgba(23,20,25,0.12)`,
            }}
          />
        ) : (
          <div
            key={x}
            style={{
              position: "absolute",
              left: px(x),
              bottom: px(96 + (i % 2) * 6),
              width: px(16),
              height: px(16),
              borderRadius: "50%",
              background: i === 1 ? "#e04a66" : "rgba(255,255,255,0.95)",
            }}
          />
        ),
      )}
      {/* candle */}
      <div
        style={{
          position: "absolute",
          left: px(81),
          bottom: px(104),
          width: px(8),
          height: px(28),
          borderRadius: px(4),
          background:
            "repeating-linear-gradient(135deg, #fff 0 4px, #f8a8c0 4px 8px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: px(79),
          bottom: px(130),
          width: px(12),
          height: px(15),
          borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
          background: "linear-gradient(180deg, #ffd166 0%, #ff8a4c 100%)",
        }}
      />
    </div>
  );
};

const PRICES: Record<CakeKind, string> = {
  brownies: "Loyang 20 cm · Rp 185.000",
  velvet: "Loyang 20 cm · Rp 210.000",
};

// One cake in the order card. `strike` crosses it out and shakes it loose,
// the way a sold-out or unsafe choice drops off a menu.
export const CakeItem = ({
  kind,
  name,
  selected,
  badge,
  strike = 0,
}: {
  readonly kind: CakeKind;
  readonly name: string;
  readonly selected?: boolean;
  readonly badge?: string;
  readonly strike?: number;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 28,
      padding: 24,
      borderRadius: 32,
      border: selected
        ? `3px solid ${COLORS.accent}`
        : `3px solid ${COLORS.hairline}`,
      background: selected ? "#fff6f2" : "#faf8f6",
      opacity: 1 - strike,
      translate: `${Math.sin(strike * Math.PI * 3) * 14}px 0px`,
      boxSizing: "border-box",
    }}
  >
    <CakeArt kind={kind} width={168} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          position: "relative",
          display: "inline-block",
        }}
      >
        {name}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "54%",
            height: 5,
            borderRadius: 3,
            width: `${Math.min(1, strike * 2.2) * 100}%`,
            background: COLORS.accent,
          }}
        />
      </div>
      <div style={{ fontSize: 26, color: COLORS.muted, marginTop: 8 }}>
        {PRICES[kind]}
      </div>
      {badge ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            marginTop: 18,
            padding: "10px 20px 10px 14px",
            borderRadius: 999,
            background: "#eaf7ee",
            color: "#2c7a47",
            fontSize: 25,
            fontWeight: 700,
          }}
        >
          <Icon name="check" size={26} color="#2c7a47" />
          {badge}
        </div>
      ) : null}
    </div>
    {selected ? (
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundImage: GRADIENT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="check" size={32} color="#fff" />
      </div>
    ) : null}
  </div>
);

// The cake shop's order screen, in the same box as the chat card.
export const OrderCard = ({
  children,
  total,
  ready,
  pressed,
  overlay,
  style,
}: {
  readonly children: React.ReactNode;
  readonly total: string;
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
        Toko Kue Manis
      </div>
      <div style={{ fontSize: 28, color: COLORS.muted, marginTop: 6 }}>
        Kue ulang tahun untuk Dita
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: COLORS.muted,
          marginTop: 40,
          marginBottom: 18,
        }}
      >
        Pilihan kue
      </div>
      <div style={{ position: "relative", height: 236 }}>{children}</div>
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 34,
          paddingTop: 30,
          borderTop: `2px solid ${COLORS.hairline}`,
          fontSize: 27,
          color: COLORS.muted,
        }}
      >
        {[
          { icon: "calendar", text: "Diambil besok, 09.00" },
          { icon: "users", text: "Untuk Dita" },
        ].map((row) => (
          <div
            key={row.text}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <Icon
              name={row.icon as "calendar" | "users"}
              size={30}
              color={COLORS.muted}
            />
            {row.text}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: "auto",
          marginBottom: 28,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 600, color: COLORS.muted }}>
          Total
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total}
        </div>
      </div>
      <div
        style={{
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
        Pesan
      </div>
    </div>
    {overlay}
  </div>
);
