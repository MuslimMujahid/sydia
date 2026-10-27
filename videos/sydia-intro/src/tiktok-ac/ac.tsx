import { COLORS } from "../theme";

// The split-type wall unit is drawn, not photographed, so the video needs no
// assets. `drip` (a 0..1 phase) runs the leak; `cool` swaps the leak for cold
// air once Pak Joko has been called and the thing finally works.
export const AcUnit = ({
  width,
  drip = 0,
  cool = false,
}: {
  readonly width: number;
  readonly drip?: number;
  readonly cool?: boolean;
}) => (
  <svg
    width={width}
    height={width * 0.63}
    viewBox="0 0 460 290"
    fill="none"
    style={{ overflow: "visible" }}
  >
    <defs>
      <linearGradient id="ac-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#ede8ee" />
      </linearGradient>
    </defs>

    {/* bracket shadow on the wall */}
    <rect
      x="30"
      y="126"
      width="400"
      height="26"
      rx="13"
      fill="rgba(23,20,25,0.10)"
    />

    {/* casing */}
    <rect x="14" y="16" width="432" height="112" rx="24" fill="url(#ac-body)" />
    <rect
      x="14"
      y="16"
      width="432"
      height="112"
      rx="24"
      stroke="rgba(23,20,25,0.12)"
      strokeWidth={3}
    />
    <rect
      x="34"
      y="30"
      width="392"
      height="18"
      rx="9"
      fill="rgba(255,255,255,0.9)"
    />
    {/* intake grille */}
    {[58, 70, 82].map((y) => (
      <path
        key={y}
        d={`M46 ${y} H414`}
        stroke="rgba(23,20,25,0.09)"
        strokeWidth={5}
        strokeLinecap="round"
      />
    ))}
    {/* status light and set point */}
    <circle cx="398" cy="70" r="7" fill={cool ? "#4aa3ff" : COLORS.amber} />
    <rect x="300" y="56" width="74" height="28" rx="8" fill="#2b2730" />
    <text
      x="337"
      y="77"
      textAnchor="middle"
      fontSize="20"
      fontWeight="700"
      fill={cool ? "#9ad1ff" : "#ffc48c"}
      fontFamily="system-ui, sans-serif"
    >
      {cool ? "16°" : "16°"}
    </text>

    {/* louver, angled down as the unit blows */}
    <g
      style={{
        transform: `rotate(${cool ? 16 : 7}deg)`,
        transformOrigin: "40px 106px",
      }}
    >
      <rect x="36" y="98" width="388" height="24" rx="12" fill="#d8d1d9" />
      <rect
        x="36"
        y="98"
        width="388"
        height="10"
        rx="5"
        fill="rgba(23,20,25,0.14)"
      />
    </g>

    {/* the leak: a wet streak, three drops on their way down, a puddle */}
    {cool ? null : (
      <>
        <path
          d="M250 126 Q244 150 252 170"
          stroke="rgba(96,165,230,0.55)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        {[0, 1, 2].map((i) => {
          const p = (drip + i * 0.34) % 1;
          return (
            <ellipse
              key={i}
              cx={[252, 158, 338][i]}
              cy={132 + p * 126}
              rx={9 - p * 2}
              ry={13 + p * 5}
              fill="#5fa8e0"
              opacity={0.35 + 0.55 * (1 - p)}
            />
          );
        })}
        <ellipse
          cx="252"
          cy="272"
          rx="92"
          ry="17"
          fill="rgba(95,168,224,0.35)"
        />
        <ellipse
          cx="252"
          cy="270"
          rx="60"
          ry="11"
          fill="rgba(95,168,224,0.45)"
        />
      </>
    )}
  </svg>
);

// Heat rising off a stifling room: wavy lines that drift upward and shimmer.
export const HeatWaves = ({
  width,
  height,
  phase,
  count = 7,
}: {
  readonly width: number;
  readonly height: number;
  readonly phase: number;
  readonly count?: number;
}) => (
  <svg
    width={width}
    height={height}
    viewBox={`0 0 ${width} ${height}`}
    fill="none"
  >
    {Array.from({ length: count }, (_, i) => {
      const x = (width / (count + 1)) * (i + 1);
      const rise = ((phase * 0.3 + i * 0.17) % 1) * height;
      const y = height - rise;
      const o = 0.5 * Math.sin((1 - rise / height) * Math.PI);
      return (
        <path
          key={i}
          d={`M${x} ${y} q 16 -26 0 -52 q -16 -26 0 -52`}
          stroke={i % 2 === 0 ? COLORS.amber : COLORS.coral}
          strokeWidth={7}
          strokeLinecap="round"
          opacity={Math.max(0, o)}
        />
      );
    })}
  </svg>
);

// Cold air finally coming out: pale blue streams fanning away from the louver.
export const CoolStream = ({
  width,
  phase,
}: {
  readonly width: number;
  readonly phase: number;
}) => (
  <svg
    width={width}
    height={width * 0.78}
    viewBox="0 0 400 312"
    fill="none"
    style={{ overflow: "visible" }}
  >
    {[0, 1, 2, 3].map((i) => {
      const p = (phase + i * 0.25) % 1;
      return (
        <path
          key={i}
          d={`M${30 + i * 26} ${20 + p * 60} q 70 ${90 + i * 16} ${150 + i * 50} ${150 + p * 70}`}
          stroke="#67b4f0"
          strokeWidth={9}
          strokeLinecap="round"
          opacity={0.55 * Math.sin(p * Math.PI)}
        />
      );
    })}
    {[0, 1, 2].map((i) => {
      const p = (phase * 1.3 + i * 0.4) % 1;
      return (
        <circle
          key={`d${i}`}
          cx={90 + i * 96 + p * 40}
          cy={60 + p * 190}
          r={9 - i}
          fill="#8ccbfb"
          opacity={0.6 * Math.sin(p * Math.PI)}
        />
      );
    })}
  </svg>
);
