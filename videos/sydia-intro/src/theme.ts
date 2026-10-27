import { loadFont } from "@remotion/google-fonts/Inter";
import { Easing } from "remotion";
import timings from "./voiceover-timings.json";
import type { SceneId } from "./script";

// Aurora Haze tokens, from the product's DESIGN.md.
export const COLORS = {
  ink: "#171419",
  muted: "#6b6470",
  canvas: "#fbf8f5",
  surface: "#ffffff",
  hairline: "rgba(23,20,25,0.08)",
  border: "rgba(23,20,25,0.06)",
  accent: "#ef5a8a",
  amber: "#ff8a4c",
  coral: "#f06694",
  violet: "#8c5cff",
};

export const GRADIENT =
  "linear-gradient(100deg, #ff8a4c 0%, #f06694 45%, #8c5cff 100%)";

export const CARD_SHADOW =
  "rgba(23,20,25,0.04) 0 2px 4px, rgba(23,20,25,0.10) 0 30px 70px -28px";

export const { fontFamily: FONT } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

// Each scene's voiceover starts this many seconds after the scene begins,
// so it lands after the incoming transition finishes.
export const VO_LEAD = 0.4;

// Seconds into the scene at which the given voiceover word starts.
export const wordAt = (scene: SceneId, wordIndex: number) =>
  VO_LEAD + timings[scene].words[wordIndex].start;
