import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Aurora } from "../../components/Aurora";
import { Pop, Rise } from "../../components/Anim";
import { Icon } from "../../components/Ui";
import { COLORS, EASE_OUT, FONT, GRADIENT } from "../../theme";
import { CakeItem, OrderCard } from "../parts";
import { Caption, Line, spokenAt } from "../voice";

const VO_AT = 0.4;
// "kacang!" strikes the brownies out, "velvet" swaps the safe cake in.
const STRIKE_AT = spokenAt("pick-rina", VO_AT, 4);
const SWAP_AT = spokenAt("pick-rina", VO_AT, 7);
const PRESS_AT = spokenAt("pick-rina", VO_AT, 8) + 0.45;
const SENT_AT = PRESS_AT + 0.3;

export const PICK_SECONDS = SENT_AT + 2.1;

// The shop's confirmation, covering the card once Rina taps Pesan.
const Ordered = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < SENT_AT) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: COLORS.surface,
        opacity: interpolate(t, [SENT_AT, SENT_AT + 0.25], [0, 1], {
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 60px",
      }}
    >
      <Pop at={SENT_AT + 0.1}>
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundImage: GRADIENT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "rgba(240,102,148,0.35) 0 24px 50px -18px",
          }}
        >
          <Icon name="check" size={110} color="#fff" />
        </div>
      </Pop>
      <Rise at={SENT_AT + 0.25} style={{ marginTop: 56 }}>
        <div
          style={{ fontSize: 60, fontWeight: 800, letterSpacing: "-0.03em" }}
        >
          Pesanan dibuat
        </div>
        <div style={{ fontSize: 32, color: COLORS.muted, marginTop: 14 }}>
          Red Velvet, tanpa kacang. Diambil besok, 09.00.
        </div>
      </Rise>
    </div>
  );
};

export const Pick = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const strike = interpolate(t, [STRIKE_AT, STRIKE_AT + 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pressed = interpolate(
    t,
    [PRESS_AT, PRESS_AT + 0.1, PRESS_AT + 0.25],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Aurora intensity={1.2} />
      <OrderCard
        total={t >= SWAP_AT ? "Rp 210.000" : "Rp 185.000"}
        ready={t >= SWAP_AT}
        pressed={pressed}
        overlay={
          <>
            <div
              style={{
                position: "absolute",
                left: 375,
                top: 753,
                width: 110,
                height: 110,
                borderRadius: 55,
                background: "rgba(23,20,25,0.18)",
                opacity: pressed,
                scale: String(0.6 + 0.4 * pressed),
              }}
            />
            <Ordered />
          </>
        }
      >
        <div style={{ position: "absolute", inset: 0 }}>
          {strike < 1 ? (
            <CakeItem
              kind="brownies"
              name="Brownies Kacang"
              selected={strike === 0}
              strike={strike}
            />
          ) : null}
          {t >= SWAP_AT ? (
            <Pop at={SWAP_AT} style={{ position: "absolute", inset: 0 }}>
              <CakeItem
                kind="velvet"
                name="Red Velvet"
                selected
                badge="Tanpa kacang"
              />
            </Pop>
          ) : null}
        </div>
      </OrderCard>

      <Caption id="pick-rina" at={VO_AT} speaker="rina" />
      <Line id="pick-rina" at={VO_AT} />
    </AbsoluteFill>
  );
};
