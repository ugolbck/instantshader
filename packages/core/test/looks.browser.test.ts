// Not a test: a screenshot harness for judging generator looks. Writes
// contact sheets to packages/core/.visual/looks/. Skipped unless VITE_LOOKS
// names the shader ids to render ("all" for every registered one):
//
//   VITE_LOOKS=silk,flow npx vitest run --project browser test/looks.browser.test.ts
//
// Per look:
//   <id>.png       4 palettes x 3 (seed, time) cells at 480x270
//   <id>-hd.png    one 1920x1080 frame
//   <id>-fx.png    dither, halftone (defaults), ascii source and palette over it at 960x540

import { describe, it } from "vitest";
import { commands } from "vitest/browser";
import { ascii, dither, getShader, halftone, renderStackFrame, shaders } from "../src/index";
import type { EffectLayer, ShaderDef } from "../src/index";

const env = (import.meta as unknown as { env: Record<string, string> }).env;
const WANT = env.VITE_LOOKS ?? "";
const IDS = WANT === "all" ? shaders.map((s) => s.id) : WANT.split(",").filter(Boolean);
// VITE_LOOKS_PARAMS="depth:0.8,light:1" overrides params in every cell.
const PARAMS: Record<string, number> = Object.fromEntries(
  (env.VITE_LOOKS_PARAMS ?? "").split(",").filter(Boolean).map((kv) => {
    const [k, v] = kv.split(":");
    return [k, Number(v)];
  }),
);
const SUFFIX = env.VITE_LOOKS_SUFFIX ?? "";

const PALETTES: string[][] = [
  ["#123C69", "#5FD4E8"],
  ["#140f30", "#9c2168", "#eb6a4e", "#fcd87c"],
  ["#FF2ED1", "#00F5A0", "#FFE600", "#00D1FF", "#FF4D4D"],
  ["#050507", "#0D0B14", "#181228", "#241A3D", "#312353", "#3E2C6B", "#4C3684", "#5A419C"],
];

const CELLS: { seed: number; timeMs: number }[] = [
  { seed: 1, timeMs: 0 },
  { seed: 7, timeMs: 3000 },
  { seed: 13, timeMs: 6000 },
];

function frame(shader: ShaderDef, colors: string[], seed: number, timeMs: number, w: number, h: number, effects: EffectLayer[] = []) {
  const { canvas, dispose } = renderStackFrame({
    source: { kind: "generator", shader, params: PARAMS }, effects, colors, seed, timeMs, width: w, height: h,
  });
  return { canvas, dispose };
}

async function savePng(name: string, canvas: HTMLCanvasElement) {
  const b64 = canvas.toDataURL("image/png").split(",")[1];
  await commands.writeFile(`./.visual/looks/${name}${SUFFIX}.png`, b64, "base64");
}

function sheet(cols: number, rows: number, w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = cols * w;
  c.height = rows * h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  return [c, ctx];
}

describe.skipIf(IDS.length === 0)("look sheets", () => {
  for (const id of IDS) {
    it(id, async () => {
      const shader = getShader(id);
      if (!shader) throw new Error(`unknown shader ${id}`);

      const [grid, gctx] = sheet(CELLS.length, PALETTES.length, 480, 270);
      PALETTES.forEach((colors, r) => {
        CELLS.forEach((cell, c) => {
          const f = frame(shader, colors, cell.seed, cell.timeMs, 480, 270);
          gctx.drawImage(f.canvas, c * 480, r * 270);
          f.dispose();
        });
      });
      await savePng(id, grid);

      const hd = frame(shader, PALETTES[1], 7, 3000, 1920, 1080);
      await savePng(`${id}-hd`, hd.canvas);
      hd.dispose();

      const fxList: EffectLayer[][] = [
        [{ effect: dither, params: { pattern: "blueNoise", size: 3, colorMode: "palette", levels: 4 } }],
        [{ effect: halftone, params: {} }],
        [{ effect: ascii, params: { size: 24, colorMode: "source", paper: "#050505" } }],
        [{ effect: ascii, params: { size: 24, colorMode: "palette", paper: "#050505" } }],
      ];
      const [fx, fctx] = sheet(1, fxList.length, 960, 540);
      fxList.forEach((effects, r) => {
        const f = frame(shader, PALETTES[1], 7, 3000, 960, 540, effects);
        fctx.drawImage(f.canvas, 0, r * 540);
        f.dispose();
      });
      await savePng(`${id}-fx`, fx);
    }, 120_000);
  }
});
