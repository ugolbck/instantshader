import { describe, expect, it } from "vitest";
import { buildPaletteRamp } from "../src/index";

const RAMP_SIZE = 1024;

function texel(ramp: Uint8Array, i: number): [number, number, number, number] {
  const idx = i * 4;
  return [ramp[idx], ramp[idx + 1], ramp[idx + 2], ramp[idx + 3]];
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("buildPaletteRamp", () => {
  it("returns a Uint8Array of length 1024 * 4", () => {
    const ramp = buildPaletteRamp(["#ff0000", "#00ff00"]);
    expect(ramp).toBeInstanceOf(Uint8Array);
    expect(ramp.length).toBe(RAMP_SIZE * 4);
  });

  it("black to white: endpoints match, alpha is opaque, luminance never decreases", () => {
    const ramp = buildPaletteRamp(["#000000", "#ffffff"]);

    const [r0, g0, b0, a0] = texel(ramp, 0);
    expect(r0).toBeLessThanOrEqual(2);
    expect(g0).toBeLessThanOrEqual(2);
    expect(b0).toBeLessThanOrEqual(2);

    const [rLast, gLast, bLast, aLast] = texel(ramp, RAMP_SIZE - 1);
    expect(rLast).toBeGreaterThanOrEqual(253);
    expect(gLast).toBeGreaterThanOrEqual(253);
    expect(bLast).toBeGreaterThanOrEqual(253);

    expect(a0).toBe(255);
    expect(aLast).toBe(255);

    let prevLum = -Infinity;
    for (let i = 0; i < RAMP_SIZE; i++) {
      const [r, g, b, a] = texel(ramp, i);
      expect(a).toBe(255);
      const lum = luminance(r, g, b);
      // Allow a hair of rounding noise but the trend must not go backward.
      expect(lum).toBeGreaterThanOrEqual(prevLum - 1);
      prevLum = lum;
    }
  });

  it("single-hue palette: every texel stays red, no hue drift", () => {
    const ramp = buildPaletteRamp(["#ff0000", "#ff0000"]);
    for (let i = 0; i < RAMP_SIZE; i++) {
      const [r, g, b] = texel(ramp, i);
      expect(r).toBeGreaterThanOrEqual(250);
      expect(g).toBeLessThanOrEqual(5);
      expect(b).toBeLessThanOrEqual(5);
    }
  });

  it("complementary stops preserve chroma at the midpoint (OKLCh polar fix)", () => {
    // Regression test: a Cartesian OKLab lerp between near-opposite hues
    // passes close to the achromatic axis at its midpoint, producing gray
    // exactly where the ramp should be most saturated. The polar OKLCh
    // interpolation must keep chroma high instead.
    const ramp = buildPaletteRamp(["#ff0000", "#00ffff"]);
    const [r, g, b] = texel(ramp, 512);
    const spread = Math.max(Math.abs(r - g), Math.abs(g - b));
    expect(spread).toBeGreaterThan(30);
  });
});
