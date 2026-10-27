import type React from "react";
import { COLORS, FONT } from "../theme";
import { Icon, Logo } from "./Ui";

const WA_GREEN = "#1fa855";

// A phone body with a notch; the screen content is up to the caller.
export const PhoneFrame = ({
  children,
  screen,
  style,
}: {
  readonly children: React.ReactNode;
  readonly screen?: string;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      width: 560,
      height: 1120,
      borderRadius: 84,
      padding: 16,
      background: "#141215",
      boxShadow:
        "rgba(23,20,25,0.18) 0 60px 120px -40px, rgba(23,20,25,0.12) 0 20px 40px -20px, inset 0 0 0 2px #2b282d",
      fontFamily: FONT,
      ...style,
    }}
  >
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 70,
        overflow: "hidden",
        background: screen ?? "#efeae2",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {children}
      <div
        style={{
          position: "absolute",
          top: 18,
          left: "50%",
          translate: "-50% 0",
          width: 150,
          height: 40,
          borderRadius: 20,
          background: "#141215",
        }}
      />
    </div>
  </div>
);

// A WhatsApp-style chat with Sydia, framed in a phone.
export const Phone = ({
  children,
  input,
  style,
}: {
  readonly children: React.ReactNode;
  readonly input?: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
  <PhoneFrame style={style}>
    {/* Status bar and chat header */}
    <div
      style={{ background: COLORS.surface, paddingTop: 64, paddingBottom: 18 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 26px",
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            background: COLORS.canvas,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1.5px solid ${COLORS.hairline}`,
          }}
        >
          <Logo size={40} />
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.ink }}>
            Sydia
          </div>
          <div style={{ fontSize: 20, color: WA_GREEN, fontWeight: 500 }}>
            online
          </div>
        </div>
      </div>
    </div>

    <div
      style={{
        flex: 1,
        // Older messages scroll off the top, like a real chat.
        minHeight: 0,
        overflow: "hidden",
        padding: "24px 22px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 16,
      }}
    >
      {children}
    </div>

    {/* Composer */}
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 18px 36px",
        alignItems: "center",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 70,
          borderRadius: 35,
          background: COLORS.surface,
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          fontSize: 25,
          color: COLORS.ink,
        }}
      >
        {input ?? <span style={{ color: "#8f8a93" }}>Ketik pesan</span>}
      </div>
      <div
        style={{
          width: 70,
          height: 70,
          borderRadius: 35,
          background: WA_GREEN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={input ? "send" : "mic"} size={32} color="#fff" />
      </div>
    </div>
  </PhoneFrame>
);

export const Bubble = ({
  from,
  children,
  style,
}: {
  readonly from: "me" | "sydia";
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      alignSelf: from === "me" ? "flex-end" : "flex-start",
      // 86% of the chat column. A percentage would resolve against the
      // shrink-to-fit Pop wrapper and squeeze image bubbles.
      maxWidth: 416,
      background: from === "me" ? "#d9fdd3" : COLORS.surface,
      borderRadius: 26,
      borderTopRightRadius: from === "me" ? 8 : 26,
      borderTopLeftRadius: from === "me" ? 26 : 8,
      padding: "16px 22px",
      fontSize: 28,
      lineHeight: 1.4,
      color: COLORS.ink,
      boxShadow: "rgba(23,20,25,0.08) 0 1px 2px",
      transformOrigin: from === "me" ? "right bottom" : "left bottom",
      ...style,
    }}
  >
    {children}
  </div>
);
