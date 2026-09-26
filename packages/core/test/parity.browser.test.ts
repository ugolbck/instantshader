// TEMPORARY (deleted in Task 7). First run saves a snapshot per case, later
// runs compare against it. Delete .visual/parity/ to re-baseline.
import { describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { bloom, getEffect } from "../src/index";
import type { ParamValue, Source } from "../src/index";
import { diffStats, renderFrame, testPicture } from "./helpers/stackTest";
import type { Frame } from "./helpers/stackTest";

const W = 480;
const H = 270;
const media = (): Source => ({ kind: "media", media: testPicture() });
const gen: Source = { kind: "generator", shader: bloom };

// [effect id, case name, source, params, max allowed mean diff]
const CASES: [string, string, () => Source, Record<string, ParamValue>, number][] = [
  ["halftone", "default", media, {}, 0.5],
  ["halftone", "paper", media, { ground: "paper", blend: "normal" }, 0.5],
  ["halftone", "palette-gen", () => gen, { colorMode: "palette" }, 0.5],
  ["ascii", "black-paper", media, { size: 24, cycle: 0, contrast: 1, ground: "paper", blend: "normal" }, 0.5],
  ["ascii", "black-paper-gen", () => gen, { size: 24, cycle: 0, contrast: 1, ground: "paper", blend: "normal", colorMode: "palette" }, 0.5],
];

function toB64(d: Uint8ClampedArray): string {
  let s = "";
  for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, i + 8192));
  return btoa(s);
}
function fromB64(b64: string): Uint8ClampedArray {
  const s = atob(b64);
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

describe("parity", () => {
  for (const [id, name, src, params, tol] of CASES) {
    it(`${id} ${name}`, async () => {
      const f = renderFrame({ source: src(), effects: [{ effect: getEffect(id)!, params }], timeMs: 1000 }, W, H);
      const path = `./.visual/parity/${id}-${name}.b64`;
      let saved: string | null = null;
      try { saved = await commands.readFile(path); } catch { saved = null; }
      if (!saved) {
        await commands.writeFile(path, toB64(f.data));
        return;
      }
      const base: Frame = { data: fromB64(saved), width: W, height: H };
      const d = diffStats(f, base);
      expect(d.mean).toBeLessThanOrEqual(tol);
      expect(d.max).toBeLessThanOrEqual(2);
    });
  }
});
