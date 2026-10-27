import { COLORS } from "../theme";

// The workshop scene is drawn, not photographed, so the video needs no assets.
// One flat-colour motorbike in side view, a mechanic crouched beside it, and a
// tool wall behind them. `width` sets the whole drawing's scale.
export const Motorbike = ({ width }: { readonly width: number }) => (
  <svg
    width={width}
    height={width * 0.6}
    viewBox="0 0 560 336"
    fill="none"
    style={{ overflow: "visible" }}
  >
    {/* shadow on the floor */}
    <ellipse cx="280" cy="300" rx="235" ry="20" fill="rgba(23,20,25,0.12)" />

    {/* wheels */}
    {[118, 442].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy="236" r="74" fill="#221f26" />
        <circle cx={cx} cy="236" r="44" fill="#35303a" />
        <circle cx={cx} cy="236" r="40" fill="#45404b" />
        <circle cx={cx} cy="236" r="13" fill="#cfc8d2" />
        {[0, 45, 90, 135].map((a) => (
          <line
            key={a}
            x1={cx + 38 * Math.cos((a * Math.PI) / 180)}
            y1={236 + 38 * Math.sin((a * Math.PI) / 180)}
            x2={cx - 38 * Math.cos((a * Math.PI) / 180)}
            y2={236 - 38 * Math.sin((a * Math.PI) / 180)}
            stroke="#b9b1bd"
            strokeWidth={5}
          />
        ))}
      </g>
    ))}

    {/* body: scooter silhouette in the brand coral */}
    <path
      d="M118 236 L166 160 L246 150 L286 96 L352 96 L368 150 L442 236"
      stroke="#bdb6c2"
      strokeWidth={13}
      strokeLinecap="round"
    />
    <path
      d="M196 196 Q214 150 268 148 L372 148 Q430 150 436 206 Q438 226 414 226 L246 226 Q198 226 196 196 Z"
      fill={COLORS.coral}
    />
    <path
      d="M246 226 L414 226 Q438 226 436 206 Q432 176 404 164 L300 164 Q250 174 246 226 Z"
      fill="rgba(23,20,25,0.14)"
    />
    {/* seat */}
    <path
      d="M300 150 Q318 126 372 128 L424 132 Q446 136 442 152 L380 156 Q320 158 300 150 Z"
      fill="#2b2730"
    />
    {/* front shield and bars */}
    <path
      d="M186 198 Q156 160 176 120 L214 76 Q226 64 240 70 L252 78 Q262 86 252 100 L218 148 Q206 172 214 198 Z"
      fill={COLORS.coral}
    />
    <path
      d="M186 198 Q156 160 176 120 L200 92 Q186 150 212 198 Z"
      fill="rgba(255,255,255,0.22)"
    />
    <path
      d="M226 78 L186 46 M186 46 L138 56 M186 46 L232 34"
      stroke="#3b3542"
      strokeWidth={12}
      strokeLinecap="round"
    />
    {/* headlamp */}
    <circle cx="214" cy="96" r="22" fill="#ffe2b8" />
    <circle cx="214" cy="96" r="22" stroke="#3b3542" strokeWidth={5} />
    <circle cx="207" cy="89" r="7" fill="#fff8ec" />
    {/* exhaust */}
    <path
      d="M392 232 L470 240 Q486 242 486 252 L486 258 Q486 268 470 266 L398 258 Z"
      fill="#9a93a0"
    />
    {/* engine block, where the oil goes */}
    <rect x="268" y="218" width="86" height="48" rx="12" fill="#4a4451" />
    <path
      d="M286 232h50M286 246h50"
      stroke="#7b7384"
      strokeWidth={6}
      strokeLinecap="round"
    />
  </svg>
);

// The mechanic, crouched with a wrench: flat shapes, no face detail beyond a
// simple profile so the drawing stays stylised.
export const Mechanic = ({ width }: { readonly width: number }) => (
  <svg
    width={width}
    height={width * 1.25}
    viewBox="0 0 240 300"
    fill="none"
    style={{ overflow: "visible" }}
  >
    <ellipse cx="124" cy="286" rx="96" ry="14" fill="rgba(23,20,25,0.12)" />
    {/* legs, crouched */}
    <path
      d="M74 290 Q58 230 86 196 L162 190 Q196 208 186 258 L180 290 Z"
      fill="#3f4a66"
    />
    <path
      d="M64 292 Q52 282 64 276 L112 272 Q124 282 112 292 Z"
      fill="#242230"
    />
    <path
      d="M168 292 Q156 282 168 276 L214 272 Q226 282 214 292 Z"
      fill="#242230"
    />
    {/* torso in a work shirt */}
    <path
      d="M80 200 Q66 136 96 112 L158 106 Q196 124 190 190 L186 204 Z"
      fill="#5b6d94"
    />
    <path d="M118 110 L140 108 L134 162 L124 162 Z" fill="#44527a" />
    {/* arm reaching to the bike */}
    <path
      d="M176 140 Q214 150 226 182"
      stroke="#5b6d94"
      strokeWidth={30}
      strokeLinecap="round"
    />
    <circle cx="228" cy="188" r="15" fill="#e0a479" />
    {/* wrench in hand */}
    <path
      d="M236 192 L268 214"
      stroke="#9a93a0"
      strokeWidth={10}
      strokeLinecap="round"
    />
    {/* head, in profile facing the bike */}
    <circle cx="130" cy="78" r="34" fill="#e0a479" />
    <path d="M100 66 Q126 40 162 58 L164 70 L98 76 Z" fill="#2f2a34" />
    <circle cx="146" cy="80" r="4" fill="#2f2a34" />
    <path
      d="M152 94 Q144 100 136 98"
      stroke="#b87c56"
      strokeWidth={4}
      strokeLinecap="round"
    />
    {/* cap */}
    <path
      d="M96 58 Q116 24 158 38 Q176 46 174 62 L168 64 Q140 50 100 64 Z"
      fill="#2c3a5c"
    />
    <path d="M168 54 Q200 58 202 68 L168 68 Z" fill="#222d48" />
  </svg>
);

// The tool wall behind the workshop floor: pegboard, hung tools, a tyre stack.
export const ToolWall = ({ width }: { readonly width: number }) => (
  <svg
    width={width}
    height={width * 0.46}
    viewBox="0 0 900 414"
    fill="none"
    style={{ overflow: "visible" }}
  >
    {/* pegboard */}
    <rect x="96" y="26" width="372" height="226" rx="16" fill="#efe7df" />
    <rect
      x="96"
      y="26"
      width="372"
      height="226"
      rx="16"
      stroke="rgba(23,20,25,0.1)"
      strokeWidth={4}
    />
    {Array.from({ length: 7 }, (_, r) =>
      Array.from({ length: 12 }, (_, c) => (
        <circle
          key={`${r}-${c}`}
          cx={124 + c * 29}
          cy={54 + r * 29}
          r="3"
          fill="rgba(23,20,25,0.12)"
        />
      )),
    )}
    {/* hung tools */}
    <path
      d="M150 72 L150 162"
      stroke="#8f8a93"
      strokeWidth={13}
      strokeLinecap="round"
    />
    <circle cx="150" cy="66" r="15" stroke="#8f8a93" strokeWidth={11} />
    <path
      d="M214 70 L238 150"
      stroke="#a29ba8"
      strokeWidth={14}
      strokeLinecap="round"
    />
    <path d="M206 58 L232 52 L238 76 L212 82 Z" fill="#a29ba8" />
    <path
      d="M300 68 L300 142"
      stroke="#8f8a93"
      strokeWidth={12}
      strokeLinecap="round"
    />
    <path d="M288 64 L312 64 L306 92 L294 92 Z" fill="#8f8a93" />
    <rect x="352" y="62" width="86" height="58" rx="10" fill="#d8cfd9" />
    <path
      d="M366 90h58"
      stroke="#8f8a93"
      strokeWidth={8}
      strokeLinecap="round"
    />
    {/* oil bottles on a shelf */}
    <rect x="96" y="186" width="372" height="12" rx="6" fill="#ddd4cd" />
    {[128, 190, 252].map((x, i) => (
      <g key={x}>
        <rect
          x={x}
          y="134"
          width="42"
          height="52"
          rx="8"
          fill={[COLORS.amber, "#6fae7c", "#7b86c9"][i]}
        />
        <rect x={x + 12} y="120" width="18" height="18" rx="4" fill="#3b3542" />
        <rect
          x={x + 6}
          y="150"
          width="30"
          height="18"
          rx="4"
          fill="rgba(255,255,255,0.8)"
        />
      </g>
    ))}
    {/* tyre stack */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <ellipse cx="640" cy={242 - i * 46} rx="92" ry="30" fill="#2b2730" />
        <ellipse cx="640" cy={236 - i * 46} rx="92" ry="30" fill="#3a3441" />
        <ellipse cx="640" cy={236 - i * 46} rx="42" ry="13" fill="#262230" />
      </g>
    ))}
    {/* jerry can */}
    <rect x="770" y="160" width="96" height="92" rx="14" fill={COLORS.amber} />
    <rect
      x="786"
      y="178"
      width="64"
      height="34"
      rx="6"
      fill="rgba(255,255,255,0.75)"
    />
    <rect x="796" y="144" width="26" height="20" rx="6" fill="#c25f28" />
    {/* floor line */}
    <path
      d="M0 252 H900"
      stroke="rgba(23,20,25,0.12)"
      strokeWidth={5}
      strokeLinecap="round"
    />
  </svg>
);
