import { COLORS } from "../theme";

// Rina in the stifling room: flat shapes, seen from the front, fanning herself
// with a sheet of paper. `fan` (-1..1) swings the hand; `sweat` (0..1) runs the
// drops down her temple; `relieved` softens the brow once the AC is fixed.
export const SweatingRina = ({
  width,
  fan = 0,
  sweat = 0,
  relieved = false,
}: {
  readonly width: number;
  readonly fan?: number;
  readonly sweat?: number;
  readonly relieved?: boolean;
}) => {
  const skin = "#e8b088";
  const shade = "#d49a74";
  return (
    <svg
      width={width}
      height={width * 1.32}
      viewBox="0 0 300 396"
      fill="none"
      style={{ overflow: "visible" }}
    >
      <ellipse cx="150" cy="384" rx="112" ry="16" fill="rgba(23,20,25,0.12)" />

      {/* torso in a loose tee */}
      <path
        d="M70 382 Q58 258 96 212 L204 212 Q242 258 230 382 Z"
        fill={relieved ? "#8fb8e8" : "#f0a3b8"}
      />
      <path
        d="M96 212 Q150 244 204 212 L212 232 Q150 268 88 232 Z"
        fill="rgba(23,20,25,0.08)"
      />
      {/* collar */}
      <path d="M126 212 Q150 236 174 212 Z" fill={shade} />

      {/* left arm resting */}
      <path
        d="M86 236 Q64 294 76 342"
        stroke={relieved ? "#8fb8e8" : "#f0a3b8"}
        strokeWidth={34}
        strokeLinecap="round"
      />
      <circle cx="78" cy="348" r="18" fill={skin} />

      {/* right arm fanning: shoulder fixed, hand swinging by the face */}
      <g
        style={{
          transform: `rotate(${fan * 13}deg)`,
          transformOrigin: "212px 238px",
        }}
      >
        <path
          d="M212 238 Q252 212 248 164"
          stroke={relieved ? "#8fb8e8" : "#f0a3b8"}
          strokeWidth={34}
          strokeLinecap="round"
        />
        <circle cx="248" cy="156" r="19" fill={skin} />
        {/* the sheet of paper she is fanning with */}
        <path d="M232 112 L286 100 L296 158 L242 172 Z" fill="#fffdfb" />
        <path
          d="M232 112 L286 100 L296 158 L242 172 Z"
          stroke="rgba(23,20,25,0.14)"
          strokeWidth={3}
        />
        <path
          d="M246 128 H280 M246 142 H276"
          stroke="rgba(23,20,25,0.14)"
          strokeWidth={4}
          strokeLinecap="round"
        />
      </g>

      {/* neck and head */}
      <rect x="134" y="186" width="32" height="34" rx="14" fill={shade} />
      <ellipse cx="150" cy="134" rx="66" ry="70" fill={skin} />
      {/* hair, pulled up in the heat */}
      <path
        d="M84 128 Q82 54 150 50 Q218 54 216 128 Q206 86 150 84 Q94 86 84 128 Z"
        fill="#2f2730"
      />
      <ellipse cx="150" cy="46" rx="26" ry="20" fill="#2f2730" />

      {/* eyes: squinting in the heat, easy once it is cool */}
      {relieved
        ? [122, 178].map((cx) => (
            <path
              key={cx}
              d={`M${cx - 13} 132 q 13 -14 26 0`}
              stroke="#2f2a34"
              strokeWidth={6}
              strokeLinecap="round"
            />
          ))
        : [122, 178].map((cx) => (
            <path
              key={cx}
              d={`M${cx - 13} 134 q 13 10 26 0`}
              stroke="#2f2a34"
              strokeWidth={6}
              strokeLinecap="round"
            />
          ))}
      {/* brows */}
      {[122, 178].map((cx) => (
        <path
          key={`b${cx}`}
          d={
            relieved
              ? `M${cx - 15} 112 h 30`
              : `M${cx - 15} ${cx === 122 ? 116 : 110} l 30 ${cx === 122 ? -6 : 6}`
          }
          stroke="#2f2730"
          strokeWidth={6}
          strokeLinecap="round"
        />
      ))}
      {/* mouth: open and wilting, or a small smile */}
      {relieved ? (
        <path
          d="M132 164 q 18 16 36 0"
          stroke="#b06a62"
          strokeWidth={6}
          strokeLinecap="round"
        />
      ) : (
        <ellipse cx="150" cy="168" rx="20" ry="13" fill="#b06a62" />
      )}
      {/* flushed cheeks */}
      {!relieved
        ? [106, 194].map((cx) => (
            <ellipse
              key={`c${cx}`}
              cx={cx}
              cy="152"
              rx="16"
              ry="10"
              fill={COLORS.coral}
              opacity="0.35"
            />
          ))
        : null}

      {/* sweat running down the temple */}
      {!relieved
        ? [0, 1].map((i) => {
            const p = (sweat + i * 0.5) % 1;
            return (
              <path
                key={`s${i}`}
                d={`M${216 - i * 4} ${106 + p * 70} q 7 10 0 18 q -7 -8 0 -18 Z`}
                fill="#6fb6ea"
                opacity={0.85 * Math.sin(p * Math.PI)}
              />
            );
          })
        : null}
    </svg>
  );
};

// A corner wall and floor so the unit and Rina share one room instead of
// floating on the canvas.
export const RoomWall = ({ width }: { readonly width: number }) => (
  <svg
    width={width}
    height={width * 0.86}
    viewBox="0 0 860 740"
    fill="none"
    style={{ overflow: "visible" }}
  >
    <rect x="0" y="0" width="860" height="614" rx="14" fill="#f3ece6" />
    <rect x="0" y="614" width="860" height="126" fill="#e6dcd4" />
    <path d="M0 614 H860" stroke="rgba(23,20,25,0.12)" strokeWidth={5} />
    {[0, 1, 2, 3, 4].map((i) => (
      <path
        key={i}
        d={`M${110 + i * 176} 614 L${60 + i * 206} 740`}
        stroke="rgba(23,20,25,0.07)"
        strokeWidth={4}
      />
    ))}
    {/* window with the glare of a hot afternoon */}
    <rect x="596" y="118" width="226" height="286" rx="12" fill="#cfe4f2" />
    <rect
      x="596"
      y="118"
      width="226"
      height="286"
      rx="12"
      stroke="rgba(23,20,25,0.14)"
      strokeWidth={6}
    />
    <path d="M709 118 V404 M596 261 H822" stroke="#f3ece6" strokeWidth={10} />
    <path d="M596 404 L822 404 L822 160 Z" fill="#ffe7bd" opacity="0.7" />
    {/* The sun sits low in the pane so the thought bubble above never hides it. */}
    <circle cx="776" cy="344" r="34" fill="#ffd27a" />
  </svg>
);
