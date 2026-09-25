// Renders README images into .github/assets/ (the effects, and the looks
// added since the original set). Not a
// test; skipped unless VITE_ASSETS is set:
//
//   VITE_ASSETS=1 npx vitest run --project browser test/assets.browser.test.ts

import { describe, it } from "vitest";
import { commands } from "vitest/browser";
import { ascii, bloom, burst, dither, dune, flow, glint, halftone, halo, nacre, pixelate, renderStackFrame, silk } from "../src/index";
import type { EffectLayer, Source } from "../src/index";

const ENABLED = Boolean((import.meta as unknown as { env: Record<string, string> }).env.VITE_ASSETS);

async function save(name: string, source: Source, effects: EffectLayer[], colors: string[], seed: number, timeMs: number) {
  const { canvas, dispose } = renderStackFrame({ source, effects, colors, seed, timeMs, width: 960, height: 540 });
  const b64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
  dispose();
  await commands.writeFile(`../../.github/assets/${name}.jpg`, b64, "base64");
}

describe.skipIf(!ENABLED)("readme assets", () => {
  it("renders one image per effect", async () => {
    await save("pixelate", { kind: "generator", shader: flow }, [{ effect: pixelate, params: { size: 36, levels: 6 } }],
      ["#4f46e5", "#ec4899", "#22d3ee"], 12, 3000);
    await save("dither", { kind: "generator", shader: bloom },
      [{ effect: dither, params: { pattern: "blueNoise", size: 3, colorMode: "palette", levels: 4 } }],
      ["#140f30", "#9c2168", "#eb6a4e", "#fcd87c"], 3, 3000);
    await save("halftone", { kind: "generator", shader: halo },
      [{ effect: halftone, params: { size: 16, angle: 30, ink: "#f4f1ea", paper: "#0b0b12", invert: true } }],
      ["#081A3D", "#123A73", "#1E63AC", "#4C9EDB", "#AEDAF7"], 5, 2000);
    await save("ascii", { kind: "generator", shader: dune },
      [{ effect: ascii, params: { size: 30, colorMode: "source", paper: "#050505" } }],
      ["#FF2ED1", "#00F5A0", "#FFE600", "#00D1FF"], 7, 2500);
  }, 120_000);

  it("renders one image per newer look", async () => {
    await save("silk", { kind: "generator", shader: silk }, [],
      ["#4f46e5", "#ec4899", "#22d3ee"], 1, 0);
    await save("nacre", { kind: "generator", shader: nacre }, [],
      ["#7aa2ff", "#8fd3ff", "#c084fc", "#67e8f9"], 13, 6000);
    await save("burst", { kind: "generator", shader: burst }, [],
      ["#1b0b3b", "#5b21b6", "#a78bfa", "#38bdf8"], 1, 0);
    await save("glint", { kind: "generator", shader: glint }, [],
      ["#4f46e5", "#ec4899", "#22d3ee", "#fde68a"], 7, 3000);
  }, 120_000);
});
