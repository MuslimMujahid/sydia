// Renders preview stills: COMP=SydiaIntro node scripts/stills.mjs out/dir frame1 frame2 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [outDir, ...frames] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({
  serveUrl,
  id: process.env.COMP ?? "SydiaIntro",
});
for (const frame of frames.map(Number)) {
  await renderStill({
    serveUrl,
    composition,
    frame,
    output: `${outDir}/f${String(frame).padStart(4, "0")}.jpg`,
    imageFormat: "jpeg",
    scale: 0.5,
  });
  console.log("frame", frame);
}
