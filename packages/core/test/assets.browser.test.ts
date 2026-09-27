// Renders README images into .github/assets/ (the effects, and the looks
// added since the original set). Not a
// test; skipped unless VITE_ASSETS is set:
//
//   VITE_ASSETS=1 npx vitest run --project browser test/assets.browser.test.ts

import { describe, it } from "vitest";
import { commands } from "vitest/browser";
import { ascii, bloom, burst, dither, flow, glint, halftone, nacre, pixelate, renderStackFrame, silk, tint } from "../src/index";
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
    await save("pixelate", { kind: "generator", shader: flow }, [{ effect: pixelate, params: {} }],
      ["#4f46e5", "#ec4899", "#22d3ee"], 12, 3000);
    await save("dither", { kind: "generator", shader: bloom },
      [{ effect: dither, params: { size: 4, opacity: 1 } }],
      ["#1a1446", "#5b2a9e", "#e0457b", "#ff9e5e", "#ffe3b3"], 3, 3000);
    await save("halftone", { kind: "generator", shader: bloom },
      [{ effect: halftone, params: { size: 26, radius: 1 } }],
      ["#1a1446", "#5b2a9e", "#e0457b", "#ff9e5e", "#ffe3b3"], 5, 2000);
    // Showcase sizes: at the default size 10 the glyphs read as texture at 960px.
    await save("ascii", { kind: "generator", shader: flow },
      [{ effect: ascii, params: { size: 30 } }],
      ["#1e1b4b", "#4f46e5", "#ec4899", "#22d3ee"], 12, 3000);
    await save("tint", { kind: "generator", shader: bloom },
      [{ effect: tint, params: { mode: "duotone", dark: "#1a1446", light: "#ffb36b" } }],
      ["#140f30", "#1f6e5b", "#21a0c4", "#b4f0e0"], 3, 3000);
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
