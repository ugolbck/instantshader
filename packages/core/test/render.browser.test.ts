import { describe, expect, it } from "vitest";
import { mountGradient, renderGradientFrame, shaders } from "../src/index";

const COLORS = ["#e84393", "#0984e3", "#fdcb6e"];
const WIDTH = 128;
const HEIGHT = 72;
const GRID = 8; // 8x8 = 64 sampled points

/** Renders one frame with the given overrides, reads a fixed 8x8 grid of
 * pixels off it via a 2D canvas, then disposes the GL context. Returns the
 * sampled pixels as [r,g,b,a] tuples. */
function px(
  def: (typeof shaders)[number],
  opts: { params?: Record<string, number>; seed?: number; timeMs?: number } = {},
): number[][] {
  const { canvas, dispose } = renderGradientFrame({
    shader: def,
    colors: COLORS,
    width: WIDTH,
    height: HEIGHT,
    ...opts,
  });

  try {
    const readCanvas = document.createElement("canvas");
    readCanvas.width = WIDTH;
    readCanvas.height = HEIGHT;
    const ctx = readCanvas.getContext("2d");
    if (!ctx) throw new Error("failed to acquire 2d context for pixel readback");
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    const samples: number[][] = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x = Math.min(WIDTH - 1, Math.floor(((gx + 0.5) / GRID) * WIDTH));
        const y = Math.min(HEIGHT - 1, Math.floor(((gy + 0.5) / GRID) * HEIGHT));
        const i = (y * WIDTH + x) * 4;
        samples.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
      }
    }
    return samples;
  } finally {
    dispose();
  }
}

function isBlack(p: number[]): boolean {
  return p[0] === 0 && p[1] === 0 && p[2] === 0;
}

function samplesEqual(a: number[][], b: number[][]): boolean {
  return a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1] && p[2] === b[i][2]);
}

for (const def of shaders) {
  describe(def.id, () => {
    it("compiles and renders without throwing", () => {
      expect(() => px(def)).not.toThrow();
    });

    it("produces a non-black, non-solid image", () => {
      const samples = px(def);

      const nonBlackCount = samples.filter((p) => !isBlack(p)).length;
      expect(nonBlackCount / samples.length).toBeGreaterThanOrEqual(0.05);

      const first = samples[0];
      const differingCount = samples.filter(
        (p) => p[0] !== first[0] || p[1] !== first[1] || p[2] !== first[2],
      ).length;
      expect(differingCount / samples.length).toBeGreaterThanOrEqual(0.05);
    });

    it("is deterministic for the same seed", () => {
      const a = px(def, { seed: 1 });
      const b = px(def, { seed: 1 });
      expect(samplesEqual(a, b)).toBe(true);
    });

    it("differs across seeds", () => {
      const a = px(def, { seed: 1 });
      const b = px(def, { seed: 7 });
      expect(samplesEqual(a, b)).toBe(false);
    });

    it("animates over time", () => {
      const a = px(def, { timeMs: 0 });
      const b = px(def, { timeMs: 4000 });
      expect(samplesEqual(a, b)).toBe(false);
    });

    for (const param of def.params) {
      it(`param "${param.key}" produces different pixels at min vs max`, () => {
        const a = px(def, { params: { [param.key]: param.min } });
        const b = px(def, { params: { [param.key]: param.max } });

        // Some params are angular/periodic, where min and max describe the
        // same physical value (e.g. 0deg === 360deg) and are therefore
        // expected to render identically. Fall back to the midpoint of the
        // range, which is guaranteed distinct from both endpoints, so the
        // assertion still checks "this knob has a visible effect" without
        // hardcoding which params are periodic.
        if (samplesEqual(a, b)) {
          const mid = (param.min + param.max) / 2;
          const c = px(def, { params: { [param.key]: mid } });
          expect(samplesEqual(a, c)).toBe(false);
        } else {
          expect(samplesEqual(a, b)).toBe(false);
        }
      });
    }

    it("dispose() does not throw", () => {
      const { dispose } = renderGradientFrame({
        shader: def,
        colors: COLORS,
        width: WIDTH,
        height: HEIGHT,
      });
      expect(() => dispose()).not.toThrow();
    });
  });
}

describe("mountGradient", () => {
  it("mounts, animates, pauses, and disposes cleanly", async () => {
    const container = document.createElement("div");
    container.style.width = "128px";
    container.style.height = "72px";
    document.body.appendChild(container);

    const handle = mountGradient(container, {
      shader: shaders[0],
      colors: COLORS,
    });

    try {
      expect(container.contains(handle.canvas)).toBe(true);

      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(container.contains(handle.canvas)).toBe(true);
      expect(handle.getTimeMs()).toBeGreaterThan(0);

      handle.pause();
    } finally {
      handle.dispose();
      container.remove();
    }
  });
});
