// Not a test: a screenshot harness. Renders comparison sheets to
// packages/core/.visual/ so a human (or an agent) can look at them. Skipped
// unless VITE_VISUAL is set:
//
//   VITE_VISUAL=1 npx vitest run --project browser test/visual.browser.test.ts

import { describe, it } from "vitest";
import { commands } from "vitest/browser";
import { ascii, bloom, dither, flow, halftone, pixelate } from "../src/index";
import type { EffectLayer, Source } from "../src/index";
import { COLORS, diffStats, downscaleLinear, renderFrame } from "./helpers/stackTest";
import type { Frame } from "./helpers/stackTest";

const ENABLED = Boolean((import.meta as unknown as { env: Record<string, string> }).env.VITE_VISUAL);
const ONLY = (import.meta as unknown as { env: Record<string, string> }).env.VITE_VISUAL_ONLY ?? "";

async function loadPhoto(): Promise<HTMLImageElement> {
  const b64 = await commands.readFile("./.visual/ref/photo.jpg", "base64");
  const img = new Image();
  img.src = `data:image/jpeg;base64,${b64}`;
  await img.decode();
  return img;
}

function put(ctx: CanvasRenderingContext2D, f: Frame, x: number, y: number): void {
  ctx.putImageData(new ImageData(f.data as Uint8ClampedArray<ArrayBuffer>, f.width, f.height), x, y);
}

function crop(f: Frame, x0: number, y0: number, w: number, h: number): Frame {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * f.width + x0) * 4;
    out.set(f.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}

/** Nearest-neighbour downscale, so a 4K crop can be shown at preview size
 * without any filtering hiding what the pixels are. */
function scaleNearest(f: Frame, w: number, h: number): Frame {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(f.width - 1, Math.floor(((x + 0.5) * f.width) / w));
      const sy = Math.min(f.height - 1, Math.floor(((y + 0.5) * f.height) / h));
      const s = (sy * f.width + sx) * 4;
      const o = (y * w + x) * 4;
      out[o] = f.data[s]; out[o + 1] = f.data[s + 1]; out[o + 2] = f.data[s + 2]; out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * One sheet per case:
 *   top-left   preview, 960x540
 *   top-right  3840x2160 export box-downscaled to 960x540 in linear light
 *   bottom-left   centre 480x270 of the preview, shown 2x nearest
 *   bottom-right  matching centre 1920x1080 of the export, shown at 960x540 nearest
 */
async function sheet(name: string, source: Source, effects: EffectLayer[], timeMs = 3000, colors: string[] = COLORS): Promise<void> {
  if (ONLY && !name.includes(ONLY)) return;
  const c = { source, effects, colors, timeMs, seed: 3 };
  const preview = renderFrame(c, 960, 540);
  const full = renderFrame(c, 3840, 2160);
  const down = downscaleLinear(full, 4);
  const stats = diffStats(preview, down);

  const out = document.createElement("canvas");
  out.width = 1920 + 8;
  out.height = 1080 + 8 + 28;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, out.width, out.height);
  put(ctx, preview, 0, 28);
  put(ctx, down, 968, 28);
  put(ctx, scaleNearest(crop(preview, 240, 135, 480, 270), 960, 540), 0, 28 + 548);
  put(ctx, scaleNearest(crop(full, 960, 540, 1920, 1080), 960, 540), 968, 28 + 548);
  ctx.fillStyle = "#ffffff";
  ctx.font = "16px monospace";
  ctx.fillText(
    `${name}   L: preview 960x540   R: 3840x2160 (top: linear box /4, bottom: centre crop)   ` +
      `diff mean ${stats.mean.toFixed(2)} p99 ${stats.p99} max ${stats.max}`,
    8,
    19,
  );
  const b64 = out.toDataURL("image/png").split(",")[1];
  await commands.writeFile(`./.visual/${name}.png`, b64, "base64");
}

describe.skipIf(!ENABLED)("visual sheets", () => {
  it("pixelate", async () => {
    const photo = await loadPhoto();
    const gen: Source = { kind: "generator", shader: bloom };
    const media: Source = { kind: "media", media: photo };
    await sheet("pixelate-bloom-24", gen, [{ effect: pixelate, params: { size: 24 } }]);
    await sheet("pixelate-bloom-7-gap", gen, [{ effect: pixelate, params: { size: 7, gap: 0.15, levels: 5 } }]);
    await sheet("pixelate-photo-16", media, [{ effect: pixelate, params: { size: 16 } }]);
    await sheet("pixelate-flow-3", { kind: "generator", shader: flow }, [{ effect: pixelate, params: { size: 3 } }]);
  }, 600_000);

  it("dither", async () => {
    const photo = await loadPhoto();
    const gen: Source = { kind: "generator", shader: bloom };
    const media: Source = { kind: "media", media: photo };
    const d = (params: Record<string, string | number | boolean>): EffectLayer[] => [{ effect: dither, params }];
    await sheet("dither-bloom-bayer4-duotone", gen, d({ size: 4, colorMode: "duotone" }));
    await sheet("dither-bloom-blue-palette4", gen, d({ size: 4, pattern: "blueNoise", colorMode: "palette", levels: 4 }));
    await sheet("dither-tricolor-palette3", gen, d({ size: 4, pattern: "blueNoise", colorMode: "palette", levels: 3 }), 3000, ["#e84393", "#0984e3", "#fdcb6e"]);
    await sheet("dither-bloom-bayer8-source", gen, d({ size: 3, pattern: "bayer8" }));
    await sheet("dither-photo-blue-duotone", media, d({ size: 3, pattern: "blueNoise", colorMode: "duotone" }));
    await sheet("dither-photo-bayer4-source3", media, d({ size: 4, levels: 3 }));
    await sheet("dither-photo-fine-size2", media, d({ size: 2, pattern: "bayer4", colorMode: "duotone" }));
  }, 600_000);

  it("halftone", async () => {
    const photo = await loadPhoto();
    const gen: Source = { kind: "generator", shader: bloom };
    const media: Source = { kind: "media", media: photo };
    const h = (params: Record<string, string | number | boolean>): EffectLayer[] => [{ effect: halftone, params }];
    await sheet("halftone-bloom-duotone", gen, h({}));
    await sheet("halftone-photo-source-hex", media, h({ grid: "hex", size: 20, colorMode: "source", paper: "#000000", invert: true, angle: 15 }));
    await sheet("halftone-photo-line", media, h({ shape: "line", size: 14, angle: 30 }));
    await sheet("halftone-bloom-palette-fine", gen, h({ size: 8, colorMode: "palette", paper: "#140f30", invert: true, radius: 1.2 }));
    await sheet("halftone-photo-square-soft", media, h({ shape: "square", size: 24, angle: 0, softness: 0.4, colorMode: "source" }));
  }, 900_000);

  it("ascii", async () => {
    const photo = await loadPhoto();
    const gen: Source = { kind: "generator", shader: bloom };
    const media: Source = { kind: "media", media: photo };
    const a = (params: Record<string, string | number | boolean>): EffectLayer[] => [{ effect: ascii, params }];
    await sheet("ascii-bloom-standard", gen, a({}));
    await sheet("ascii-photo-dense", media, a({ charset: "dense", size: 16 }));
    await sheet("ascii-bloom-blocks-palette", gen, a({ charset: "blocks", size: 20, colorMode: "palette" }));
    await sheet("ascii-photo-duotone-small", media, a({ size: 12, colorMode: "duotone" }));
  }, 900_000);
});
