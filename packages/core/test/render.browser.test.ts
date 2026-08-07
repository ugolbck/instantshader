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
  opts: {
    params?: Record<string, number>;
    seed?: number;
    timeMs?: number;
    loopSeconds?: number;
  } = {},
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

/** Renders one frame and returns EVERY pixel channel, not the 8x8 grid px()
 * samples. Used by the seam test, which needs a stable whole-frame statistic
 * rather than a sparse sample. */
function fullFrame(
  def: (typeof shaders)[number],
  opts: { params?: Record<string, number>; seed?: number; timeMs?: number; loopSeconds?: number },
): number[] {
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
    return Array.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  } finally {
    dispose();
  }
}

/** Mean absolute per-channel difference between two full frames, alpha
 * excluded.
 *
 * Deliberately the MEAN and not the max. Max is close to useless here: a
 * single pixel drifting across a palette boundary swings one channel by ~80
 * no matter where in the cycle you sample, so the max is dominated by that
 * one pixel and varies 60-106 between two frames 50ms apart at ANY phase.
 * The mean moves in a tight band (~1.3-2.0 for these shaders), which makes a
 * genuine discontinuity stand out by an order of magnitude. */
function meanAbsDiff(a: number[], b: number[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue; // skip alpha
    sum += Math.abs(a[i] - b[i]);
    n++;
  }
  return sum / n;
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

    describe("seamless looping", () => {
      // Spread across the interesting regimes: 4s is below beam's breathing
      // cutoff (loopFreq rounds to 0 there), 30s is just above it, 8s is the
      // short-loop case the video pipeline actually wants.
      for (const loopSeconds of [4, 8, 30]) {
        for (const seed of [0, 13.5]) {
          it(`is exactly periodic at ${loopSeconds}s (seed ${seed})`, () => {
            const a = px(def, { timeMs: 0, loopSeconds, seed });
            const b = px(def, { timeMs: loopSeconds * 1000, loopSeconds, seed });
            expect(samplesEqual(a, b)).toBe(true);
          });
        }

        it(`still animates within the ${loopSeconds}s cycle`, () => {
          // Guards the degenerate pass: freezing time would satisfy every
          // periodicity assertion above while destroying the feature.
          const a = px(def, { timeMs: 0, loopSeconds });
          const b = px(def, { timeMs: loopSeconds * 500, loopSeconds });
          expect(samplesEqual(a, b)).toBe(false);
        });

        it(`has no discontinuity across the ${loopSeconds}s wrap`, () => {
          // Periodicity alone cannot see a seam: it only compares t=0 with
          // t=period, and a hard jump between them still lands on identical
          // pixels. What proves seamlessness is that the step ACROSS the wrap
          // is ordinary — indistinguishable from any other step of the same
          // duration elsewhere in the cycle.
          //
          // Grain off: it is an uncorrelated per-pixel hash by design, so it
          // adds a constant floor of change that has nothing to do with
          // whether the underlying motion is continuous.
          const step = 50;
          const params = { grain: 0 };
          const stepAt = (timeMs: number) =>
            meanAbsDiff(
              fullFrame(def, { timeMs, loopSeconds, params }),
              fullFrame(def, { timeMs: timeMs + step, loopSeconds, params }),
            );

          // Baseline: how much this shader ordinarily changes in `step` ms.
          // Sampled at TEN phases because the rate is genuinely uneven —
          // beam's sway alone varies its own step size by ~2.5x around a
          // cycle — so a handful of probes can easily all land on calm
          // instants and manufacture a ceiling the wrap can't meet.
          const PHASES = 10;
          const ordinary = Array.from({ length: PHASES }, (_, k) =>
            stepAt((k / PHASES) * loopSeconds * 1000),
          );
          const worstOrdinary = Math.max(...ordinary);

          const seam = stepAt(loopSeconds * 1000 - step);
          expect(seam).toBeLessThanOrEqual(worstOrdinary * 1.5);

          // Positive control — without it the assertion above could pass on a
          // shader that simply never moves. The SAME comparison with looping
          // disabled spans a genuine `loopSeconds`-long jump in the animation,
          // and must register as dramatically worse.
          const unlooped = meanAbsDiff(
            fullFrame(def, { timeMs: loopSeconds * 1000 - step, params }),
            fullFrame(def, { timeMs: 0, params }),
          );
          expect(unlooped).toBeGreaterThan(worstOrdinary * 3);
        });
      }

      it("does not alter output when loopSeconds is omitted", () => {
        // The whole compatibility promise: with no loop requested, u_loop is
        // 0 and both GLSL helpers fall back to the original arithmetic.
        for (const timeMs of [0, 1500, 4000]) {
          const a = px(def, { timeMs, seed: 3 });
          const b = px(def, { timeMs, seed: 3, loopSeconds: 0 });
          expect(samplesEqual(a, b)).toBe(true);
        }
      });

      it("differs from the non-looping animation at the same instant", () => {
        // Sanity that u_loop is actually reaching the GPU and changing the
        // path, rather than the loop tests passing for some unrelated reason.
        const a = px(def, { timeMs: 3000, seed: 3 });
        const b = px(def, { timeMs: 3000, seed: 3, loopSeconds: 8 });
        expect(samplesEqual(a, b)).toBe(false);
      });
    });

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
