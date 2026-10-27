import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Rise } from "../components/Anim";
import { COLORS, EASE_OUT } from "../theme";

// Grey bar standing in for a line of printed contract text.
const Bar = ({
  w,
  faint = false,
}: {
  readonly w: number | string;
  readonly faint?: boolean;
}) => (
  <div
    style={{
      width: w,
      height: 9,
      borderRadius: 5,
      background: faint ? "rgba(23,20,25,0.09)" : "rgba(23,20,25,0.16)",
    }}
  />
);

const Clause = ({
  title,
  lines,
}: {
  readonly title: string;
  readonly lines: readonly (number | string)[];
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: "rgba(23,20,25,0.42)",
        letterSpacing: "0.04em",
      }}
    >
      {title}
    </div>
    {lines.map((w, i) => (
      <Bar key={i} w={w} faint />
    ))}
  </div>
);

// Page three of the contract Rina saved, with Pasal 7 the only clause set in
// real type. `highlight` (0..1) paints the marker sweep over it; `focus`
// dims the rest of the page so the eye lands on the clause.
export const ContractPage = ({
  width,
  highlight = 0,
  focus = 0,
}: {
  readonly width: number;
  readonly highlight?: number;
  readonly focus?: number;
}) => {
  const u = width / 560;
  return (
    <div
      style={{
        width,
        height: width * 1.33,
        background: "#fffdfb",
        borderRadius: 10 * u,
        boxShadow: `rgba(23,20,25,0.16) 0 ${22 * u}px ${44 * u}px -${18 * u}px, rgba(23,20,25,0.06) 0 ${2 * u}px ${4 * u}px`,
        boxSizing: "border-box",
        padding: `${44 * u}px ${46 * u}px`,
        position: "relative",
        overflow: "hidden",
        color: COLORS.ink,
      }}
    >
      <div
        style={{
          scale: String(u),
          transformOrigin: "top left",
          width: 560 - 92,
          display: "flex",
          flexDirection: "column",
          gap: 26,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingBottom: 14,
            borderBottom: "2px solid rgba(23,20,25,0.1)",
            opacity: 1 - 0.55 * focus,
          }}
        >
          <div style={{ fontSize: 19, fontWeight: 800 }}>
            PERJANJIAN SEWA KAMAR
          </div>
          <div style={{ fontSize: 15, color: "rgba(23,20,25,0.4)" }}>
            Hal. 3
          </div>
        </div>

        <div style={{ opacity: 1 - 0.7 * focus }}>
          <Clause title="PASAL 6 — KEBERSIHAN" lines={["100%", "92%", "64%"]} />
        </div>

        {/* Pasal 7, the clause that answers the question */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: -14,
              top: 26,
              height: 96,
              width: `calc(100% + 28px)`,
              borderRadius: 8,
              background:
                "linear-gradient(100deg, rgba(255,214,120,0.95) 0%, rgba(255,186,140,0.9) 100%)",
              clipPath: `inset(0 ${(1 - highlight) * 100}% 0 0)`,
              mixBlendMode: "multiply",
            }}
          />
          <div style={{ position: "relative" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: COLORS.accent,
                letterSpacing: "0.04em",
              }}
            >
              PASAL 7 — HEWAN PELIHARAAN
            </div>
            <div
              style={{
                fontSize: 23,
                fontWeight: 700,
                lineHeight: 1.42,
                marginTop: 11,
                letterSpacing: "-0.01em",
              }}
            >
              Penyewa diperbolehkan memelihara hewan di dalam kamar, dengan izin
              tertulis dari pemilik kos.
            </div>
          </div>
        </div>

        <div style={{ opacity: 1 - 0.7 * focus }}>
          <Clause title="PASAL 8 — TAMU" lines={["100%", "78%"]} />
        </div>
        <div style={{ opacity: 1 - 0.7 * focus }}>
          <Clause title="PASAL 9 — PEMBAYARAN" lines={["100%", "96%", "52%"]} />
        </div>
      </div>

      {/* signature block, kept pale so it reads as the page's foot */}
      <div
        style={{
          position: "absolute",
          left: 46 * u,
          bottom: 40 * u,
          display: "flex",
          gap: 54 * u,
          opacity: 0.5 - 0.3 * focus,
        }}
      >
        {["Pemilik", "Penyewa"].map((label) => (
          <div
            key={label}
            style={{ display: "flex", flexDirection: "column", gap: 7 * u }}
          >
            <div
              style={{
                width: 118 * u,
                height: 2 * u,
                background: "rgba(23,20,25,0.25)",
              }}
            />
            <div style={{ fontSize: 13 * u, color: "rgba(23,20,25,0.45)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Animated wrapper: the page rises in, then the marker sweeps over Pasal 7.
export const HighlightedClause = ({
  at,
  markAt,
  width,
}: {
  readonly at: number;
  readonly markAt: number;
  readonly width: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const opts = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  } as const;
  return (
    <Rise at={at} distance={26} blur={false}>
      <ContractPage
        width={width}
        highlight={interpolate(t, [markAt, markAt + 0.55], [0, 1], opts)}
        focus={interpolate(t, [markAt - 0.1, markAt + 0.5], [0, 1], opts)}
      />
    </Rise>
  );
};
