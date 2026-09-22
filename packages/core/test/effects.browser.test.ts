import { describe, expect, it } from "vitest";
import { bloom, createStackRenderer, effects, gridFor, halo, renderGradientFrame } from "../src/index";
import type { EffectDef, EffectLayer, ParamValue, Source } from "../src/index";
import { dither } from "../src/index";
import { resolveEffectParams } from "../src/effectParams";
import {
  COLORS,
  diffStats,
  downscaleLinear,
  framesEqual,
  renderFrame,
  sampleCells,
  testPicture,
} from "./helpers/stackTest";

// Each effect's own motion, switched on. An effect missing from this map has
// no motion of its own.
const MOTION: Record<string, Record<string, ParamValue>> = {
  dither: { shimmer: 8 },
  halftone: { pulse: 1 },
  ascii: { cycle: 8 },
};

const generator: Source = { kind: "generator", shader: bloom };
const picture = (): Source => ({ kind: "media", media: testPicture() });

function sources(): [string, () => Source][] {
  return [
    ["over a generator", () => generator],
    ["over a still image", picture],
  ];
}

function layer(def: EffectDef, params?: Record<string, ParamValue>): EffectLayer[] {
  return [{ effect: def, params }];
}

/** Whole output pixels per cell on both axes at this frame size? */
function wholeCells(def: EffectDef, params: Record<string, ParamValue> | undefined, w: number, h: number): boolean {
  if (!def.grid) return false;
  const g = gridFor(w, h, def.grid.cell(resolveEffectParams(def, params)));
  return Number.isInteger(g.pxPerCell[0]) && Number.isInteger(g.pxPerCell[1]);
}

for (const def of effects) {
  describe(def.id, () => {
    const motion = MOTION[def.id];

    it("compiles and changes the picture", () => {
      const plain = renderFrame({ source: generator }, 320, 180);
      const fx = renderFrame({ source: generator, effects: layer(def) }, 320, 180);
      expect(framesEqual(plain, fx)).toBe(false);
    });

    it("is deterministic across renderer instances", () => {
      const c = { source: generator, effects: layer(def, motion), timeMs: 1234, seed: 5 };
      expect(framesEqual(renderFrame(c, 320, 180), renderFrame(c, 320, 180))).toBe(true);
    });

    for (const [name, make] of sources()) {
      describe(name, () => {
        // ---- fidelity: the acceptance tests of SPEC-effects.md ------------

        // Only for draw stages that fill each cell with its value, which the
        // default coverage draw and Pixelate's do. Halftone (a rotated
        // lattice of shapes) and ASCII (glyphs) are covered by the
        // downscaled-export test below instead.
        if (def.grid && !def.grid.lattice && def.id !== "ascii") {
          it("has identical cells at 1080p and at 4K", () => {
            // With whole pixels per cell, sampling each cell's centre reads
            // the cell buffer back through the draw stage.
            expect(wholeCells(def, motion, 1920, 1080)).toBe(true);
            const g = gridFor(1920, 1080, def.grid!.cell(resolveEffectParams(def, motion)));
            const c = { source: make(), effects: layer(def, motion), timeMs: 2500 };
            const a = sampleCells(renderFrame(c, 1920, 1080), g.pxPerCell[0]);
            const b = sampleCells(renderFrame(c, 3840, 2160), g.pxPerCell[0] * 2);
            expect(a.length).toBe(b.length);
            let differing = 0;
            for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing++;
            expect(differing).toBe(0);
          });
        }

        it("previews what the 4K export looks like downscaled", () => {
          const c = { source: make(), effects: layer(def, motion), timeMs: 2500 };
          const preview = renderFrame(c, 960, 540);
          const full = downscaleLinear(renderFrame(c, 3840, 2160), 4);
          const d = diffStats(preview, full);
          expect(d.mean).toBeLessThanOrEqual(1.5);
          expect(d.p99).toBeLessThanOrEqual(8);
        });

        // ---- time ----------------------------------------------------------

        if (motion) {
          for (const loopSeconds of [4, 8, 30]) {
            it(`is exactly periodic at ${loopSeconds}s`, () => {
              const c = { source: make(), effects: layer(def, motion), loopSeconds };
              const a = renderFrame({ ...c, timeMs: 0 }, 320, 180);
              const b = renderFrame({ ...c, timeMs: loopSeconds * 1000 }, 320, 180);
              expect(framesEqual(a, b)).toBe(true);
            });
          }

          it("moves on its own over a still image", () => {
            const c = { source: picture(), effects: layer(def, motion), loopSeconds: 8 };
            const a = renderFrame({ ...c, timeMs: 0 }, 320, 180);
            const b = renderFrame({ ...c, timeMs: 4000 }, 320, 180);
            expect(framesEqual(a, b)).toBe(false);
          });
        }
      });
    }

    it("holds still over a still image when its motion is off", () => {
      const c = { source: picture(), effects: layer(def) };
      const a = renderFrame({ ...c, timeMs: 0 }, 320, 180);
      const b = renderFrame({ ...c, timeMs: 5000 }, 320, 180);
      expect(framesEqual(a, b)).toBe(true);
    });

    it("random params render without throwing", () => {
      let s = 7;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 4; i++) {
        expect(() => renderFrame({ source: generator, effects: layer(def, def.randomParams(rand)) }, 160, 90)).not.toThrow();
      }
    });
  });
}

describe("stack", () => {
  const pixelate = effects.find((e) => e.id === "pixelate")!;

  it("with no layers renders exactly what renderGradientFrame renders", () => {
    const a = renderFrame({ source: { kind: "generator", shader: halo }, seed: 2, timeMs: 900 }, 256, 144);
    const { canvas, dispose } = renderGradientFrame({
      shader: halo, colors: COLORS, seed: 2, timeMs: 900, width: 256, height: 144,
    });
    const read = document.createElement("canvas");
    read.width = 256;
    read.height = 144;
    const ctx = read.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    dispose();
    expect(framesEqual(a, { data: ctx.getImageData(0, 0, 256, 144).data, width: 256, height: 144 })).toBe(true);
  });

  it("treats a disabled layer as absent", () => {
    const plain = renderFrame({ source: generator }, 256, 144);
    const off = renderFrame({ source: generator, effects: [{ effect: pixelate, enabled: false }] }, 256, 144);
    expect(framesEqual(plain, off)).toBe(true);
  });

  it("makes whole, uniform blocks at 1080p and 4K", () => {
    // Size 20 divides 1920 and 1080 into an even number of cells, so the
    // centred grid starts exactly at the frame's corner.
    for (const [w, h, px] of [[1920, 1080, 20], [3840, 2160, 40]] as const) {
      const f = renderFrame({ source: picture(), effects: layer(pixelate, { size: 20 }) }, w, h);
      // Every pixel of a cell equals the cell's first pixel. Checked on a
      // band of cells through the middle of the frame.
      for (let cy = 20; cy < 24; cy++) {
        for (let cx = 0; cx < w / px; cx++) {
          const first = ((cy * px) * w + cx * px) * 4;
          for (let y = 0; y < px; y++) {
            for (let x = 0; x < px; x++) {
              const i = ((cy * px + y) * w + cx * px + x) * 4;
              if (f.data[i] !== f.data[first] || f.data[i + 1] !== f.data[first + 1] || f.data[i + 2] !== f.data[first + 2]) {
                throw new Error(`cell ${cx},${cy} is not uniform at ${w}x${h}`);
              }
            }
          }
        }
      }
    }
  });

  it("chains layers", () => {
    const one = renderFrame({ source: generator, effects: layer(pixelate, { size: 40 }) }, 320, 180);
    const two = renderFrame(
      { source: generator, effects: [{ effect: pixelate, params: { size: 40 } }, { effect: pixelate, params: { size: 12, gap: 0.2 } }] },
      320, 180,
    );
    expect(framesEqual(one, two)).toBe(false);
  });

  it("applies live param, source and layer changes", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const stack = createStackRenderer({ canvas, source: generator, colors: COLORS, effects: layer(pixelate) });
    const read = (): string => {
      stack.renderAt(0);
      return canvas.toDataURL();
    };
    const a = read();
    stack.setEffectParams(0, { size: 60 });
    const b = read();
    expect(b).not.toBe(a);
    expect(stack.getGridInfo()[0].cols).toBe(32);
    stack.setSource(picture());
    const c = read();
    expect(c).not.toBe(b);
    stack.setEffects([]);
    expect(stack.getGridInfo()).toEqual([]);
    expect(read()).not.toBe(c);
    stack.resize(640, 360);
    stack.setEffects(layer(pixelate));
    expect(() => stack.renderAt(0)).not.toThrow();
    stack.dispose();
  });

  it("survives many create/dispose cycles", () => {
    for (let i = 0; i < 20; i++) {
      renderFrame({ source: generator, effects: layer(pixelate) }, 64, 36);
    }
  });
});

/** A flat picture of one color. */
function flat(hex: string): Source {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 36;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 64, 36);
  return { kind: "media", media: c };
}

describe("dither", () => {
  const duotone = { colorMode: "duotone", ink: "#000000", paper: "#ffffff" };

  for (const pattern of ["bayer2", "bayer4", "bayer8", "blueNoise"]) {
    it(`${pattern}: pure black and pure white stay pure`, () => {
      for (const [hex, want] of [["#000000", 0], ["#ffffff", 255]] as const) {
        const f = renderFrame({ source: flat(hex), effects: layer(dither, { ...duotone, pattern, size: 2 }) }, 320, 180);
        for (let i = 0; i < f.data.length; i += 4) {
          if (f.data[i] !== want) throw new Error(`${pattern} lit a ${hex} pixel as ${f.data[i]}`);
        }
      }
    });

    it(`${pattern}: adds no brightness bias to a mid grey`, () => {
      // #808080 is tone 128/255. Two-level dither must light that share of
      // cells, to within the pattern's own resolution.
      const f = renderFrame({ source: flat("#808080"), effects: layer(dither, { ...duotone, pattern, size: 1 }) }, 1920, 1080);
      let lit = 0;
      for (let i = 0; i < f.data.length; i += 4) if (f.data[i] > 127) lit++;
      expect(lit / (f.data.length / 4)).toBeCloseTo(128 / 255, 1);
    });
  }

  it("a preview too small to resolve the pattern still has the export's brightness", () => {
    // 0.75 output px per cell: every preview pixel blends several cells. In
    // gamma space that blend would come out far darker than the export seen
    // from a distance.
    const c = { source: flat("#808080"), effects: layer(dither, { ...duotone, size: 2 }) };
    const tiny = renderFrame(c, 720, 405);
    const big = downscaleLinear(renderFrame(c, 2880, 1620), 4);
    expect(diffStats(tiny, big).mean).toBeLessThanOrEqual(2);
  });

  it("palette mode over a generator outputs only palette stops", () => {
    const colors = ["#e84393", "#0984e3", "#fdcb6e"];
    const f = renderFrame(
      { source: generator, colors, effects: layer(dither, { colorMode: "palette", levels: 3, pattern: "blueNoise" }) },
      1920, 1080,
    );
    const seen = new Set<string>();
    for (let i = 0; i < f.data.length; i += 4) seen.add(`${f.data[i]},${f.data[i + 1]},${f.data[i + 2]}`);
    expect(seen.size).toBeLessThanOrEqual(3);
  });
});

describe("soft effects", () => {
  // No shipped effect is soft any more (halftone moved to a lattice), so the
  // path is exercised with a minimal one: invert the layer below.
  const invert: EffectDef = {
    id: "test-invert",
    label: "Invert",
    fragment: "void main() { gl_FragColor = vec4(1.0 - source(v_uv).rgb, 1.0); }",
    params: [],
    randomParams: () => ({}),
  };

  it("reads the layer below at frame size", () => {
    const plain = renderFrame({ source: picture() }, 160, 90);
    const inv = renderFrame({ source: picture(), effects: layer(invert) }, 160, 90);
    for (let i = 0; i < plain.data.length; i += 4) {
      if (Math.abs(255 - plain.data[i] - inv.data[i]) > 1) throw new Error("not inverted");
    }
  });

  it("chains under and over grid effects", () => {
    const pixelate = effects.find((e) => e.id === "pixelate")!;
    const twice = renderFrame({ source: picture(), effects: [{ effect: invert }, { effect: invert }] }, 160, 90);
    const plain = renderFrame({ source: picture() }, 160, 90);
    expect(diffStats(twice, plain).max).toBeLessThanOrEqual(1);
    expect(() =>
      renderFrame({ source: generator, effects: [{ effect: invert }, { effect: pixelate }, { effect: invert }] }, 160, 90),
    ).not.toThrow();
  });
});
