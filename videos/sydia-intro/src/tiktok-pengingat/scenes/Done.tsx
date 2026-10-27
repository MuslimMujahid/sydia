import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise, Typewriter } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { TypingDots } from "../../scenes/Chat";
import { COLORS, EASE_OUT, FONT } from "../../theme";
import { BigBubble, ChatCard, DayDivider, Sfx } from "../../tiktok/parts";
import { PENGINGAT_SCRIPT } from "../script";
import { Caption, Line, LINES, spokenAt } from "../voice";

const TYPE_AT = 0.4;
const SEND_AT = TYPE_AT + LINES["done-rina"].duration + 0.15;
const REPLY_AT = SEND_AT + 0.8;
const REPLY_VO = REPLY_AT + 0.1;

export const DONE_SECONDS = REPLY_VO + LINES["done-sydia"].duration + 0.6;

const MESSAGE = PENGINGAT_SCRIPT[5].text;

const Task = ({
  label,
  when,
  at,
  done,
}: {
  readonly label: string;
  readonly when?: string;
  readonly at: number;
  readonly done?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at * fps) return null;
  const checked = done !== undefined && frame >= done * fps;
  return (
    <Rise at={at} distance={18} blur={false}>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            flexShrink: 0,
            border: checked ? "none" : "3px solid rgba(23,20,25,0.22)",
            background: checked ? COLORS.accent : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? (
            <Pop at={done as number}>
              <Icon name="check" size={32} color="#fff" />
            </Pop>
          ) : null}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              textDecoration: checked ? "line-through" : "none",
              color: checked ? COLORS.muted : COLORS.ink,
              fontWeight: 600,
            }}
          >
            {label}
          </div>
          {when ? (
            <div
              style={{ fontSize: 28, color: COLORS.accent, fontWeight: 600 }}
            >
              {when}
            </div>
          ) : null}
        </div>
      </div>
    </Rise>
  );
};

const Shown = ({
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

export const Done = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />
      <ChatCard
        style={{
          translate: interpolate(
            frame,
            [0, 0.5 * fps],
            ["0px 100px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_OUT,
            },
          ),
        }}
        input={
          t >= TYPE_AT && t < SEND_AT ? (
            <Typewriter
              text={MESSAGE}
              at={TYPE_AT}
              cps={MESSAGE.length / (LINES["done-rina"].duration - 0.3)}
              style={{ fontSize: 30 }}
            />
          ) : undefined
        }
      >
        <DayDivider>Hari ini</DayDivider>
        <BigBubble from="sydia">Rina, waktunya beli obat untuk Mama.</BigBubble>
        <BigBubble from="sydia">
          Belum sempat, ya? Saya ingatkan lagi. Obat Mama jangan sampai lupa.
        </BigBubble>
        <Shown at={SEND_AT} from="me">
          <BigBubble from="me">{MESSAGE}</BigBubble>
        </Shown>
        {t >= SEND_AT + 0.3 && t < REPLY_AT ? (
          <BigBubble from="sydia">
            <TypingDots />
          </BigBubble>
        ) : null}
        <Shown at={REPLY_AT} from="sydia">
          <BigBubble from="sydia" style={{ width: 640 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Sip, saya tandai selesai.
            </div>
            <Task
              label="Beli obat untuk Mama"
              at={REPLY_AT}
              done={spokenAt("done-sydia", REPLY_VO, 3)}
            />
            <Task
              label="Transfer SPP Adik"
              when="Besok pagi, 08.00"
              at={spokenAt("done-sydia", REPLY_VO, 4)}
            />
          </BigBubble>
        </Shown>
      </ChatCard>

      <Caption id="done-rina" at={TYPE_AT} speaker="rina" />
      <Caption id="done-sydia" at={REPLY_VO} speaker="sydia" />

      <Line id="done-rina" at={TYPE_AT} />
      <Sfx kind="sent" at={SEND_AT} />
      <Sfx kind="received" at={REPLY_AT} />
      <Line id="done-sydia" at={REPLY_VO} />
    </AbsoluteFill>
  );
};
