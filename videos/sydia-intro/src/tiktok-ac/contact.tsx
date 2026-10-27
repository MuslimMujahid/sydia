import { useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../components/Anim";
import { COLORS } from "../theme";
import { AliasChip, Avatar, ContactRow, PhoneGlyph } from "./parts";

// The one contact this video is about, kept in a single place so the card in
// the chat and the call screen cannot drift apart. The number is deliberately
// fake.
export const JOKO = {
  name: "Pak Joko",
  initials: "PJ",
  alias: "Tukang AC",
  phone: "0812-0000-1234",
  note: "Servis AC · terakhir datang Maret",
} as const;

// The contact card Sydia sends: name, the alias it was found by, the saved
// number and the note. Each row lands on the words that name it.
export const ContactCard = ({
  nameAt,
  aliasAt,
  phoneAt,
  noteAt,
  press = 0,
}: {
  readonly nameAt: number;
  readonly aliasAt: number;
  readonly phoneAt: number;
  readonly noteAt: number;
  // Scales the number row down a touch as Rina taps it.
  readonly press?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <div
      style={{
        width: 584,
        borderRadius: 28,
        background: "#fff8f4",
        border: "2px solid rgba(239,90,138,0.22)",
        padding: "26px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Avatar initials={JOKO.initials} size={92} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              opacity: t >= nameAt ? 1 : 0,
            }}
          >
            {JOKO.name}
          </div>
          {/* The alias is why the search hit, so it lights up as Sydia says it. */}
          <div style={{ marginTop: 10, height: 48 }}>
            {t >= aliasAt ? (
              <Pop at={aliasAt} style={{ transformOrigin: "left center" }}>
                <AliasChip label={`Alias · ${JOKO.alias}`} lit />
              </Pop>
            ) : null}
          </div>
        </div>
      </div>

      <div
        style={{
          height: 2,
          background: "rgba(23,20,25,0.07)",
          borderRadius: 1,
        }}
      />

      {/* Fixed height: rows arrive one by one without resizing the card. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          minHeight: 124,
        }}
      >
        <ContactRow at={noteAt} icon="calendar" label="Catatan">
          <span style={{ fontSize: 27 }}>{JOKO.note}</span>
        </ContactRow>
        <div style={{ scale: String(1 - 0.03 * press) }}>
          <ContactRow at={phoneAt} icon="phone" label="Nomor tersimpan">
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {JOKO.phone}
            </span>
          </ContactRow>
        </div>
      </div>
    </div>
  );
};

// The button on Rina's own phone. Sydia never dials; Rina taps this herself.
export const CallButton = ({
  pressed = 0,
  label = "Telepon",
}: {
  readonly pressed?: number;
  readonly label?: string;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 16,
      padding: "22px 44px",
      borderRadius: 999,
      background: "#1fa855",
      color: "#fff",
      fontSize: 36,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      whiteSpace: "nowrap",
      scale: String(1 - 0.06 * pressed),
      boxShadow: "rgba(31,168,85,0.42) 0 20px 44px -16px",
    }}
  >
    <PhoneGlyph size={34} color="#fff" />
    {label}
  </div>
);

// A fingertip ring, so a tap reads as a tap and not as a pop-in.
export const Tap = ({
  progress,
  size = 150,
}: {
  // 0 at touch-down, 1 when the ripple has faded.
  readonly progress: number;
  readonly size?: number;
}) => {
  if (progress <= 0 || progress >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        translate: "-50% -50%",
        borderRadius: "50%",
        border: `6px solid ${COLORS.accent}`,
        scale: String(0.35 + progress * 0.9),
        opacity: 1 - progress,
      }}
    />
  );
};
