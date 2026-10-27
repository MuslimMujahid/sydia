import { COLORS } from "../theme";

// Rina caught off guard: flat shapes, seen from the front, one hand up by her
// cheek. `jolt` (-1..1) rocks her shoulders; `relieved` swaps the wide eyes and
// open mouth for an easy smile.
export const PanickedRina = ({
  width,
  jolt = 0,
  relieved = false,
}: {
  readonly width: number;
  readonly jolt?: number;
  readonly relieved?: boolean;
}) => {
  const skin = "#e8b088";
  const shade = "#d49a74";
  const shirt = relieved ? "#8fb8e8" : "#f0a3b8";
  return (
    <svg
      width={width}
      height={width * 1.32}
      viewBox="0 0 300 396"
      fill="none"
      style={{ overflow: "visible" }}
    >
      <ellipse cx="150" cy="384" rx="112" ry="16" fill="rgba(23,20,25,0.12)" />

      <g
        style={{
          transform: `rotate(${jolt * 2.5}deg)`,
          transformOrigin: "150px 330px",
        }}
      >
        {/* torso */}
        <path
          d="M70 382 Q58 258 96 212 L204 212 Q242 258 230 382 Z"
          fill={shirt}
        />
        <path
          d="M96 212 Q150 244 204 212 L212 232 Q150 268 88 232 Z"
          fill="rgba(23,20,25,0.08)"
        />
        <path d="M126 212 Q150 236 174 212 Z" fill={shade} />

        {/* left arm down */}
        <path
          d="M86 236 Q62 292 74 342"
          stroke={shirt}
          strokeWidth={34}
          strokeLinecap="round"
        />
        <circle cx="76" cy="348" r="18" fill={skin} />

        {/* right arm: flung up by the cheek when startled, resting when calm */}
        <g
          style={{
            transform: `rotate(${jolt * 6}deg)`,
            transformOrigin: "212px 238px",
          }}
        >
          <path
            d={
              relieved
                ? "M212 238 Q244 292 232 342"
                : "M212 238 Q256 206 234 158"
            }
            stroke={shirt}
            strokeWidth={34}
            strokeLinecap="round"
          />
          <circle
            cx={relieved ? 230 : 232}
            cy={relieved ? 348 : 150}
            r="19"
            fill={skin}
          />
        </g>

        {/* neck and head */}
        <rect x="134" y="186" width="32" height="34" rx="14" fill={shade} />
        <ellipse cx="150" cy="134" rx="66" ry="70" fill={skin} />
        <path
          d="M84 128 Q82 54 150 50 Q218 54 216 128 Q206 86 150 84 Q94 86 84 128 Z"
          fill="#2f2730"
        />
        <ellipse cx="150" cy="46" rx="26" ry="20" fill="#2f2730" />

        {/* eyes: blown wide at the sudden call, soft once it is handled */}
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
              <g key={cx}>
                <ellipse cx={cx} cy="134" rx="13" ry="15" fill="#fffdfb" />
                <circle cx={cx} cy="136" r="7.5" fill="#2f2a34" />
              </g>
            ))}

        {/* brows: shot up, or level */}
        {[122, 178].map((cx) => (
          <path
            key={`b${cx}`}
            d={
              relieved
                ? `M${cx - 15} 112 h 30`
                : `M${cx - 16} ${cx === 122 ? 106 : 102} q 16 ${cx === 122 ? -9 : -9} 32 ${cx === 122 ? 4 : 4}`
            }
            stroke="#2f2730"
            strokeWidth={6}
            strokeLinecap="round"
          />
        ))}

        {/* mouth */}
        {relieved ? (
          <path
            d="M132 166 q 18 16 36 0"
            stroke="#b06a62"
            strokeWidth={6}
            strokeLinecap="round"
          />
        ) : (
          <ellipse cx="150" cy="170" rx="17" ry="14" fill="#b06a62" />
        )}

        {/* flushed cheeks while she is flustered */}
        {!relieved
          ? [106, 194].map((cx) => (
              <ellipse
                key={`c${cx}`}
                cx={cx}
                cy="154"
                rx="16"
                ry="10"
                fill={COLORS.coral}
                opacity="0.35"
              />
            ))
          : null}
      </g>
    </svg>
  );
};

// A desk the laptop and clock can stand on, so nothing floats on the canvas.
export const DeskSurface = ({ width }: { readonly width: number }) => (
  <svg
    width={width}
    height={width * 0.2}
    viewBox="0 0 860 172"
    fill="none"
    style={{ overflow: "visible" }}
  >
    <path d="M0 34 H860 V58 H0 Z" fill="#e3d6c9" />
    <path d="M0 34 H860" stroke="rgba(23,20,25,0.12)" strokeWidth={4} />
    <path
      d="M30 58 L58 172 M830 58 L802 172"
      stroke="#d6c7b7"
      strokeWidth={16}
    />
  </svg>
);
