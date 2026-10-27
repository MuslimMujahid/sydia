import { COLORS } from "../theme";

// The boarding-house doorway is drawn, not photographed, so the video needs no
// assets: a tiled corridor wall, one room door with its number plate, a mat and
// a potted plant. `width` scales the whole drawing.
export const KosDoor = ({ width }: { readonly width: number }) => (
  <svg
    width={width}
    height={width * 1.28}
    viewBox="0 0 440 564"
    fill="none"
    style={{ overflow: "visible" }}
  >
    {/* corridor wall */}
    <rect x="0" y="0" width="440" height="486" rx="10" fill="#f1e9e2" />
    <path d="M0 486H440" stroke="rgba(23,20,25,0.12)" strokeWidth={5} />
    {/* floor tiles */}
    <rect x="0" y="486" width="440" height="78" fill="#e6ddd6" />
    {[0, 1, 2, 3].map((i) => (
      <path
        key={i}
        d={`M${40 + i * 110} 486 L${8 + i * 128} 564`}
        stroke="rgba(23,20,25,0.08)"
        strokeWidth={4}
      />
    ))}

    {/* door frame */}
    <rect x="74" y="54" width="292" height="432" rx="8" fill="#cfc3b8" />
    <rect x="90" y="70" width="260" height="416" rx="4" fill="#b9826a" />
    <rect x="90" y="70" width="260" height="416" rx="4" fill="url(#grain)" />
    <defs>
      <linearGradient id="grain" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.1" />
      </linearGradient>
    </defs>
    {/* recessed panels */}
    {[108, 290].map((y) => (
      <rect
        key={y}
        x="122"
        y={y}
        width="196"
        height={y === 108 ? 150 : 162}
        rx="6"
        fill="#a9725b"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={3}
      />
    ))}
    {/* number plate */}
    <rect x="186" y="128" width="68" height="46" rx="8" fill="#f7f3ee" />
    <text
      x="220"
      y="162"
      textAnchor="middle"
      fontSize="32"
      fontWeight="700"
      fill="#6b6470"
      fontFamily="system-ui, sans-serif"
    >
      12
    </text>
    {/* handle */}
    <circle cx="124" cy="282" r="13" fill="#e8c893" />
    <rect x="112" y="268" width="12" height="28" rx="6" fill="#d8b378" />

    {/* doormat */}
    <path d="M96 500 L344 500 L368 548 L72 548 Z" fill="#9aa08f" />
    <path
      d="M118 512 L322 512 M110 530 L334 530"
      stroke="rgba(255,255,255,0.3)"
      strokeWidth={6}
    />

    {/* potted plant beside the door */}
    <path d="M378 448 L430 448 L422 510 L386 510 Z" fill="#c97c52" />
    <rect x="372" y="436" width="64" height="18" rx="6" fill="#dd8f61" />
    <path
      d="M404 436 Q372 408 378 366 Q404 386 404 436"
      fill="#6fae7c"
      opacity="0.95"
    />
    <path
      d="M404 436 Q440 404 436 358 Q406 382 404 436"
      fill="#5d9a6a"
      opacity="0.95"
    />
    <path d="M404 436 Q404 394 404 352" stroke="#4f8a5c" strokeWidth={5} />
    <ellipse cx="404" cy="520" rx="52" ry="10" fill="rgba(23,20,25,0.12)" />
  </svg>
);

// The stray kitten on the doorstep: flat shapes, sitting, tail swept to one
// side. `sway` (-1..1) tips the tail and head a little so it feels alive.
export const Kitten = ({
  width,
  sway = 0,
}: {
  readonly width: number;
  readonly sway?: number;
}) => {
  const fur = "#e5a463";
  const dark = "#cf8a4b";
  return (
    <svg
      width={width}
      height={width * 1.1}
      viewBox="0 0 260 286"
      fill="none"
      style={{ overflow: "visible" }}
    >
      <ellipse cx="130" cy="266" rx="92" ry="16" fill="rgba(23,20,25,0.14)" />
      {/* tail, curling out to the right */}
      <path
        d={`M186 248 Q${246 + sway * 10} ${238 - sway * 18} ${228 + sway * 6} ${176 - sway * 14}`}
        stroke={fur}
        strokeWidth={26}
        strokeLinecap="round"
      />
      <path
        d={`M214 196 Q${236 + sway * 6} ${190 - sway * 8} ${226 + sway * 6} ${176 - sway * 12}`}
        stroke={dark}
        strokeWidth={26}
        strokeLinecap="round"
      />
      {/* body */}
      <path d="M72 258 Q66 174 130 164 Q194 174 188 258 Z" fill={fur} />
      <path d="M100 258 Q96 198 130 188 Q164 198 160 258 Z" fill="#fbe6cd" />
      {/* front paws */}
      {[98, 146].map((x) => (
        <rect
          key={x}
          x={x}
          y="238"
          width="40"
          height="24"
          rx="12"
          fill="#fbe6cd"
        />
      ))}
      {/* head */}
      <g
        style={{
          transform: `rotate(${sway * 3}deg)`,
          transformOrigin: "130px 150px",
        }}
      >
        {/* ears */}
        <path d="M62 112 L74 44 L124 86 Z" fill={fur} />
        <path d="M78 98 L84 66 L108 86 Z" fill="#f4b9a6" />
        <path d="M198 112 L186 44 L136 86 Z" fill={fur} />
        <path d="M182 98 L176 66 L152 86 Z" fill="#f4b9a6" />
        <ellipse cx="130" cy="118" rx="72" ry="62" fill={fur} />
        {/* stripes on the forehead */}
        <path
          d="M112 66 L104 86 M130 60 L130 82 M148 66 L156 86"
          stroke={dark}
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* muzzle */}
        <ellipse cx="130" cy="142" rx="44" ry="30" fill="#fbe6cd" />
        {/* eyes, wide and hopeful */}
        {[104, 156].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy="112" rx="17" ry="19" fill="#2f2a34" />
            <circle cx={cx + 5} cy="105" r="6" fill="#fff" />
          </g>
        ))}
        {/* nose and mouth */}
        <path d="M130 130 L120 138 L140 138 Z" fill={COLORS.accent} />
        <path
          d="M130 140 Q130 150 118 150 M130 140 Q130 150 142 150"
          stroke="#b9875f"
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* whiskers */}
        <path
          d="M90 136 L52 128 M90 146 L54 150 M170 136 L208 128 M170 146 L206 150"
          stroke="rgba(23,20,25,0.3)"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
};

// A paw glyph for chips and badges; the shared icon set has none.
export const Paw = ({
  size = 28,
  color = COLORS.accent,
}: {
  readonly size?: number;
  readonly color?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <ellipse cx="12" cy="15.5" rx="5.6" ry="4.8" />
    <ellipse cx="5.6" cy="10.2" rx="2.5" ry="3.1" />
    <ellipse cx="10" cy="6.6" rx="2.5" ry="3.3" />
    <ellipse cx="14" cy="6.6" rx="2.5" ry="3.3" />
    <ellipse cx="18.4" cy="10.2" rx="2.5" ry="3.1" />
  </svg>
);
