import { loadFont as loadScript } from "@remotion/google-fonts/GreatVibes";
import { loadFont as loadSerif } from "@remotion/google-fonts/Cormorant";

// The invitations are drawn, not photographed, so the video needs no assets.
// A wedding card earns a script face and a serif; the rest of the video stays Inter.
export const { fontFamily: SCRIPT } = loadScript("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
export const { fontFamily: SERIF } = loadSerif("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});

type Tone = "gold" | "blush" | "sage" | "dusk";

const TONES: Record<Tone, { bg: string; line: string; ink: string }> = {
  gold: {
    bg: "linear-gradient(160deg, #fffdf6 0%, #f6ecd9 100%)",
    line: "#c6a053",
    ink: "#8a6a2d",
  },
  blush: {
    bg: "linear-gradient(160deg, #fffaf9 0%, #fbe8ec 100%)",
    line: "#d79aa7",
    ink: "#9d5467",
  },
  sage: {
    bg: "linear-gradient(160deg, #fbfdf8 0%, #e8efe2 100%)",
    line: "#97ad89",
    ink: "#5b7650",
  },
  dusk: {
    bg: "linear-gradient(160deg, #fcfbff 0%, #eae6f6 100%)",
    line: "#a398c6",
    ink: "#625288",
  },
};

// A two-branch sprig for the top of the card, the one ornament each card gets.
const Sprig = ({
  u,
  color,
}: {
  readonly u: number;
  readonly color: string;
}) => (
  <svg
    width={76 * u}
    height={30 * u}
    viewBox="0 0 76 30"
    fill="none"
    stroke={color}
    strokeWidth={1.1}
    strokeLinecap="round"
  >
    <path d="M38 28C38 19 33 11 24 6M38 28C38 19 43 11 52 6" />
    {[
      [33, 20, -38],
      [30, 14, -48],
      [26, 8, -58],
      [43, 20, 38],
      [46, 14, 48],
      [50, 8, 58],
    ].map(([x, y, rot]) => (
      <ellipse
        key={`${x}-${y}`}
        cx={x}
        cy={y}
        rx={4.6}
        ry={2.1}
        fill={color}
        fillOpacity={0.5}
        stroke="none"
        transform={`rotate(${rot} ${x} ${y})`}
      />
    ))}
    <circle cx={38} cy={3} r={1.7} fill={color} stroke="none" />
  </svg>
);

export type Invite = {
  readonly bride: string;
  readonly groom: string;
  readonly day: string;
  readonly date: string;
  readonly detail: string;
  readonly tone: Tone;
};

export const SARAH: Invite = {
  bride: "Sarah",
  groom: "Bagas",
  day: "Sabtu",
  date: "07 . 11 . 2026",
  detail: "11.00 WIB · Graha Cakrawala",
  tone: "gold",
};

// The other invitations in the pile. Only Sarah's is ever read.
export const OTHERS: readonly Invite[] = [
  {
    bride: "Dewi",
    groom: "Rizky",
    day: "Minggu",
    date: "15 . 11 . 2026",
    detail: "10.00 WIB · Balai Kartini",
    tone: "sage",
  },
  {
    bride: "Maya",
    groom: "Yoga",
    day: "Sabtu",
    date: "21 . 11 . 2026",
    detail: "19.00 WIB · Hotel Mawar",
    tone: "dusk",
  },
  {
    bride: "Putri",
    groom: "Arif",
    day: "Sabtu",
    date: "28 . 11 . 2026",
    detail: "16.00 WIB · Gedung Melati",
    tone: "blush",
  },
];

// One printed invitation. `blurDate` smudges the date block, which is how the
// pile reads when Rina cannot remember any of them.
export const InviteCard = ({
  invite,
  width,
  blurDate = false,
}: {
  readonly invite: Invite;
  readonly width: number;
  readonly blurDate?: boolean;
}) => {
  const u = width / 340;
  const tone = TONES[invite.tone];
  return (
    <div
      style={{
        width,
        height: width * 1.4,
        borderRadius: 14 * u,
        background: tone.bg,
        boxShadow: `rgba(23,20,25,0.18) 0 ${26 * u}px ${48 * u}px -${20 * u}px, rgba(23,20,25,0.08) 0 ${2 * u}px ${4 * u}px`,
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: `${30 * u}px ${26 * u}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: tone.ink,
        fontFamily: SERIF,
      }}
    >
      {/* double rule frame */}
      <div
        style={{
          position: "absolute",
          inset: 14 * u,
          borderRadius: 8 * u,
          border: `${1.4 * u}px solid ${tone.line}`,
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 20 * u,
          borderRadius: 5 * u,
          border: `${0.8 * u}px solid ${tone.line}`,
          opacity: 0.3,
        }}
      />
      <Sprig u={u} color={tone.line} />
      <div
        style={{
          marginTop: 16 * u,
          fontSize: 11 * u,
          fontWeight: 600,
          letterSpacing: "0.34em",
          opacity: 0.75,
        }}
      >
        UNDANGAN PERNIKAHAN
      </div>
      <div
        style={{
          fontFamily: SCRIPT,
          fontSize: 54 * u,
          lineHeight: 1.1,
          marginTop: 18 * u,
          color: tone.ink,
        }}
      >
        {invite.bride}
      </div>
      <div style={{ fontSize: 22 * u, opacity: 0.6, lineHeight: 1 }}>&</div>
      <div
        style={{
          fontFamily: SCRIPT,
          fontSize: 54 * u,
          lineHeight: 1.1,
          color: tone.ink,
        }}
      >
        {invite.groom}
      </div>
      <div
        style={{
          width: 72 * u,
          height: 1 * u,
          background: tone.line,
          opacity: 0.5,
          margin: `${22 * u}px 0`,
        }}
      />
      <div
        style={{
          filter: blurDate ? `blur(${5.5 * u}px)` : undefined,
          opacity: blurDate ? 0.75 : 1,
        }}
      >
        <div
          style={{ fontSize: 12 * u, letterSpacing: "0.3em", opacity: 0.75 }}
        >
          {invite.day.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 23 * u,
            fontWeight: 600,
            letterSpacing: "0.14em",
            marginTop: 6 * u,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {invite.date}
        </div>
        <div style={{ fontSize: 14 * u, marginTop: 8 * u, opacity: 0.8 }}>
          {invite.detail}
        </div>
      </div>
    </div>
  );
};
