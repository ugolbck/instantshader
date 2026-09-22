// Shared helpers for the effects browser tests: render a stack to pixels,
// downscale in linear light, compare frames.

import { renderStackFrame } from "../../src/index";
import type { EffectLayer, Source } from "../../src/index";

export const COLORS: string[] = ["#140f30", "#9c2168", "#eb6a4e", "#fcd87c"];

export type Frame = { data: Uint8ClampedArray; width: number; height: number };

export type StackCase = {
  source: Source;
  effects?: EffectLayer[];
  colors?: string[];
  seed?: number;
  timeMs?: number;
  loopSeconds?: number;
};

/** Renders one frame of a stack at an exact size and reads every pixel back
 * (top row first, like any ImageData). */
export function renderFrame(c: StackCase, width: number, height: number): Frame {
  const { canvas, dispose } = renderStackFrame({
    source: c.source,
    effects: c.effects,
    colors: c.colors ?? COLORS,
    seed: c.seed,
    timeMs: c.timeMs,
    loopSeconds: c.loopSeconds,
    width,
    height,
  });
  try {
    const read = document.createElement("canvas");
    read.width = width;
    read.height = height;
    const ctx = read.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(canvas, 0, 0);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    dispose();
  }
}

const TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function toSrgb8(l: number): number {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/** Box-downscales by a whole factor in LINEAR light: what the eye does to a
 * fine pattern seen from far enough away, and the reference a faithful
 * preview has to match. */
export function downscaleLinear(f: Frame, factor: number): Frame {
  const w = f.width / factor;
  const h = f.height / factor;
  if (!Number.isInteger(w) || !Number.isInteger(h)) throw new Error("factor must divide the frame");
  const out = new Uint8ClampedArray(w * h * 4);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < factor; j++) {
        let i = ((y * factor + j) * f.width + x * factor) * 4;
        for (let k = 0; k < factor; k++, i += 4) {
          r += TO_LINEAR[f.data[i]];
          g += TO_LINEAR[f.data[i + 1]];
          b += TO_LINEAR[f.data[i + 2]];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = toSrgb8(r / n);
      out[o + 1] = toSrgb8(g / n);
      out[o + 2] = toSrgb8(b / n);
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Mean and 99th-percentile absolute per-channel difference, alpha excluded. */
export function diffStats(a: Frame, b: Frame): { mean: number; p99: number; max: number } {
  const hist = new Uint32Array(256);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (i % 4 === 3) continue;
    const d = Math.abs(a.data[i] - b.data[i]);
    hist[d]++;
    sum += d;
    n++;
  }
  let acc = 0;
  let p99 = 0;
  let max = 0;
  for (let d = 0; d < 256; d++) {
    if (hist[d] > 0) max = d;
    acc += hist[d];
    if (acc / n < 0.99) p99 = d + 1;
  }
  return { mean: sum / n, p99, max };
}

export function framesEqual(a: Frame, b: Frame): boolean {
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** Samples one pixel per grid cell at the cell's centre. With whole output
 * pixels per cell this reads the cell buffer back through the draw stage. */
export function sampleCells(f: Frame, pxPerCell: number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(pxPerCell / 2); y < f.height; y += pxPerCell) {
    for (let x = Math.floor(pxPerCell / 2); x < f.width; x += pxPerCell) {
      const i = (y * f.width + x) * 4;
      out.push(f.data[i], f.data[i + 1], f.data[i + 2]);
    }
  }
  return out;
}

/** A detailed synthetic picture for media tests: smooth gradient, hard
 * shapes, fine stripes. Deterministic, no asset needed. */
export function testPicture(width = 1200, height = 800): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "#0b1d51");
  g.addColorStop(0.5, "#d9466f");
  g.addColorStop(1, "#ffe9a8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(width * 0.3, height * 0.4, height * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#101010";
  ctx.fillRect(width * 0.55, height * 0.2, width * 0.25, height * 0.5);
  for (let x = 0; x < width * 0.3; x += 6) {
    ctx.fillStyle = x % 12 === 0 ? "#00d0c0" : "#402060";
    ctx.fillRect(width * 0.62 + x * 0.5, height * 0.75, 3, height * 0.2);
  }
  return c;
}
