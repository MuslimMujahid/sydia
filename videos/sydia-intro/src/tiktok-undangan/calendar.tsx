import {
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Pop, Rise } from "../components/Anim";
import { Icon } from "../components/Ui";
import { COLORS, EASE_OUT, GRADIENT } from "../theme";
import { SAFE, SAFE_WIDTH } from "../tiktok/parts";
import { Clock } from "./parts";

// November 2026 starts on a Sunday, so the 7th really is the Saturday
// the invitation names and the grid needs no offset.
const DAYS = ["S", "M", "S", "R", "K", "J", "S"];
const WEDDING = 7;
const REMINDER = 4;
// Card is SAFE_WIDTH wide with 40px padding each side; seven equal columns
// keep the weekday header aligned with the date grid.
const CELL = (SAFE_WIDTH - 80) / 7;

const Cell = ({
  day,
  mark,
  pulse,
}: {
  readonly day: number;
  readonly mark: "none" | "wedding" | "reminder";
  readonly pulse: number;
}) => (
  <div
    style={{
      width: CELL,
      height: 86,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    }}
  >
    {mark === "wedding" ? (
      <div
        style={{
          position: "absolute",
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundImage: GRADIENT,
          boxShadow: "rgba(240,102,148,0.4) 0 14px 30px -10px",
          scale: String(1 + 0.06 * pulse),
        }}
      />
    ) : null}
    {mark === "reminder" ? (
      <div
        style={{
          position: "absolute",
          width: 76,
          height: 76,
          borderRadius: 38,
          background: "#fff2ec",
          border: `3px solid ${COLORS.accent}`,
        }}
      />
    ) : null}
    <div
      style={{
        position: "relative",
        fontSize: 34,
        fontWeight: mark === "none" ? 500 : 800,
        color:
          mark === "wedding"
            ? "#fff"
            : mark === "reminder"
              ? COLORS.accent
              : COLORS.ink,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {day}
    </div>
  </div>
);

// A month view with the wedding saved on the 7th and the gift reminder on the 4th.
export const CalendarCard = ({
  weddingAt,
  reminderAt,
}: {
  readonly weddingAt: number;
  readonly reminderAt: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pulse = interpolate(
    t,
    [weddingAt, weddingAt + 0.45, weddingAt + 0.9],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT },
  );

  return (
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
        padding: "40px 40px 36px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Img
          src={staticFile("google-calendar.svg")}
          style={{ width: 54, height: 54 }}
        />
        <div>
          <div
            style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.03em" }}
          >
            November 2026
          </div>
          <div style={{ fontSize: 24, color: COLORS.muted, marginTop: 2 }}>
            Kalender Rina
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 30,
          fontSize: 23,
          fontWeight: 700,
          color: COLORS.muted,
        }}
      >
        {DAYS.map((d, i) => (
          <div key={i} style={{ width: CELL, textAlign: "center" }}>
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          flexWrap: "wrap",
          width: CELL * 7,
        }}
      >
        {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
          <Cell
            key={day}
            day={day}
            mark={
              day === WEDDING && t >= weddingAt
                ? "wedding"
                : day === REMINDER && t >= reminderAt
                  ? "reminder"
                  : "none"
            }
            pulse={pulse}
          />
        ))}
      </div>

      <Rise at={weddingAt + 0.1} distance={22} style={{ marginTop: 24 }}>
        <div
          style={{
            borderRadius: 26,
            background: "#fff8f4",
            border: "2px solid rgba(239,90,138,0.22)",
            padding: "22px 26px",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <Pop at={weddingAt + 0.15}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 17,
                backgroundImage: GRADIENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="calendar" size={30} color="#fff" />
            </div>
          </Pop>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 31, fontWeight: 700 }}>
              Nikahan Sarah &amp; Bagas
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 24,
                color: COLORS.muted,
                marginTop: 4,
              }}
            >
              <Clock size={24} color={COLORS.muted} />
              Sab, 7 Nov · 11.00 · Graha Cakrawala
            </div>
          </div>
        </div>
      </Rise>

      {t >= reminderAt ? (
        <Rise at={reminderAt} distance={22} style={{ marginTop: 18 }}>
          <div
            style={{
              borderRadius: 26,
              background: "#faf8f6",
              border: `2px solid ${COLORS.hairline}`,
              padding: "22px 26px",
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 17,
                background: "#fff2ec",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="bell" size={30} color={COLORS.accent} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{ fontSize: 26, fontWeight: 700, color: COLORS.accent }}
              >
                H-3 · Rabu, 4 Nov
              </div>
              <div style={{ fontSize: 29, fontWeight: 600, marginTop: 2 }}>
                Beli kado buat Sarah
              </div>
            </div>
          </div>
        </Rise>
      ) : null}
    </div>
  );
};
