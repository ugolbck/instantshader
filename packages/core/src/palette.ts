// Builds the 1D color ramp texture InstantShader shaders sample to turn a
// scalar "t" value into a color. Interpolation happens in OKLCh — OKLab's
// polar form (lightness, chroma, hue) — rather than sRGB, HSL, or a straight
// Cartesian OKLab lerp.
//
// OKLab over sRGB/HSL is the easy part: a straight line between red and blue
// in sRGB crosses a muddy gray-purple, while the same line in OKLab passes
// through a visible, saturated region that matches how the eye actually
// blends those hues.
//
// But a Cartesian OKLab lerp (straight line through (L, a, b)) has its own
// failure mode: two stops with near-opposite hues sit close to opposite
// sides of the achromatic axis, so the straight line between them passes
// close to a=b=0 at its midpoint — chroma collapses toward zero and the
// ramp goes gray exactly where it should be at its most saturated. This is
// not theoretical: a "neon" palette with stops of chroma >= 0.147 everywhere
// can still have its straight-OKLab ramp bottom out at chroma 0.001
// mid-segment; a "jewel-tone" palette (stops >= 0.075) bottoms out at 0.005.
// No shader can recover a color that was never written into the ramp
// texture it samples.
//
// Interpolating in polar OKLCh fixes this by giving chroma its own
// coordinate instead of deriving it from two independently-lerped Cartesian
// axes: L and C are lerped linearly same as before, but hue takes the
// shorter arc around the circle, so chroma can stay high (following
// whatever path C0 -> C1 lerps to) while hue sweeps around instead of a
// straight line dragging both through zero. See lerpHue() below for the
// wraparound/achromatic-endpoint handling this requires.
//
// This file implements its own color math rather than importing it, on
// purpose: instantshader ships with zero dependencies, so its math stays
// self-contained instead of pulling in an external color library.

/** Number of texels in the output ramp. Matches a typical 1D LUT texture size:
 * large enough that per-texel banding is invisible, small enough to upload
 * as a single texture row every time colors change. */
const RAMP_SIZE = 1024;

/**
 * Converts one sRGB channel (0-1, gamma-encoded) to linear light.
 * Piecewise per the sRGB spec: a linear segment near black avoids the
 * infinite slope a pure power curve would have at 0.
 */
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse of linearize(): linear light back to gamma-encoded sRGB (0-1). */
function delinearize(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * sRGB -> OKLab, Björn Ottosson's method (https://bottosson.github.io/posts/oklab/).
 * Coefficients copied verbatim from that reference implementation —
 * do not hand-retype these, they are fitted constants, not derivable values.
 *
 * The two 3x3 matrices convert linear sRGB to an LMS-like cone response
 * space and then to the final Lab-like OKLab space; the cube root in
 * between is what makes the space perceptually uniform.
 */
function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = linearize(r), lg = linearize(g), lb = linearize(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/**
 * OKLab -> sRGB, inverse of rgbToOklab. Same fitted-constant caveat as
 * above — do not hand-retype these coefficients.
 */
function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    delinearize(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    delinearize(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    delinearize(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * OKLab -> OKLCh: rectangular (L, a, b) to polar (L, C, h). C is just the
 * distance of (a, b) from the achromatic origin; h is the angle, in
 * radians, measured the same way atan2 always does (range (-pi, pi]).
 */
function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
  return [L, Math.hypot(a, b), Math.atan2(b, a)];
}

/**
 * OKLCh -> OKLab: polar back to rectangular, so the existing oklabToRgb
 * matrices can be reused unchanged instead of duplicating the LMS math for
 * a polar input.
 */
function oklchToOklab(L: number, C: number, h: number): [number, number, number] {
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

/**
 * Chroma below which a hue angle is noise rather than signal. Near a=b=0,
 * atan2 is numerically unstable (its output can swing wildly for a tiny
 * change in a near-zero a or b), and perceptually a near-gray stop simply
 * doesn't have a hue to speak of. Below this threshold a stop is treated as
 * achromatic for interpolation purposes: see lerpHue().
 *
 * ~0.005 in OKLCh chroma units is comfortably below any stop actually used
 * for color (the lab palettes' least-saturated non-neutral stops sit at
 * 0.075+) and comfortably above float rounding noise from the hex -> OKLab
 * round trip.
 */
const ACHROMATIC_CHROMA = 0.005;

const TAU = Math.PI * 2;

/**
 * Interpolates hue from h0 toward h1 by fraction t, taking the SHORTER way
 * around the circle (e.g. 350deg -> 10deg moves +20deg through 0, not -340deg
 * backward through 180deg) instead of a plain linear lerp, which would sweep
 * through every intermediate hue on the long way round.
 *
 * Two edge cases handled explicitly:
 *
 * - Achromatic endpoint: if one side's chroma is below ACHROMATIC_CHROMA,
 *   its "hue" is meaningless (see the constant's comment), so it inherits
 *   the other endpoint's hue instead of contributing its own noisy angle.
 *   Concretely this means a gray-to-color segment holds a constant hue
 *   while only chroma ramps up, rather than spiraling through unrelated
 *   hues the gray's atan2 noise happened to produce. If both endpoints are
 *   achromatic the chosen hue is never visible: C stays near zero for the
 *   whole segment (it's lerped independently, from ~0 to ~0), so whatever
 *   angle comes out of cos/sin gets multiplied by ~0.
 * - Exact opposition (180 degrees apart): both directions around the circle
 *   are equally short, so "shorter arc" is ambiguous. The wrap below always
 *   normalizes a signed delta of exactly +-pi to -pi (see the comment on
 *   the wrap), which picks one direction consistently rather than depending
 *   on float rounding to break the tie.
 */
function lerpHue(h0: number, c0: number, h1: number, c1: number, t: number): number {
  const start = c0 < ACHROMATIC_CHROMA && c1 >= ACHROMATIC_CHROMA ? h1 : h0;
  const end = c1 < ACHROMATIC_CHROMA && c0 >= ACHROMATIC_CHROMA ? h0 : h1;

  // Wrap the raw difference into (-pi, pi]. Math.round ties-to-+Infinity
  // (Math.round(0.5) === 1, Math.round(-0.5) === -0), so a delta of exactly
  // +-pi always lands on -pi after the wrap — a fixed, deterministic choice
  // for the 180-degree case rather than one that depends on which endpoint
  // happened to be "start".
  let delta = end - start;
  delta -= TAU * Math.round(delta / TAU);

  return start + delta * t;
}

/** Parses a "#rrggbb" (or "rrggbb") hex string into 0-1 sRGB components. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/**
 * Builds a 1024-texel RGBA ramp (Uint8Array, length 1024*4) by interpolating
 * the given hex color stops in OKLCh space (see the top-of-file comment for
 * why polar rather than Cartesian OKLab).
 *
 * Stops are placed at evenly spaced positions: color i sits at t = i/(n-1)
 * (a single-color palette is treated as that color duplicated at t=0 and
 * t=1, so it produces a flat ramp rather than dividing by zero). The ramp
 * is NOT wrapped: texel 0 is exactly the first color, texel 1023 is exactly
 * the last. Shaders that want a mirrored/looping gradient are responsible
 * for remapping their sample coordinate (e.g. abs(fract(t)*2-1)) before
 * sampling this texture.
 */
export function buildPaletteRamp(colors: string[]): Uint8Array {
  if (colors.length === 0) {
    throw new Error("buildPaletteRamp requires at least one color");
  }

  // Normalize to at least two stops so the breakpoint spacing below never
  // divides by zero; a single color just becomes a flat two-stop ramp.
  const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;
  const stopCount = stops.length;

  // Precompute each stop's OKLCh coordinates once instead of per-texel.
  const stopsOklch = stops.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    return oklabToOklch(...rgbToOklab(r, g, b));
  });

  // Snap each stop's "ideal" continuous position (i/(n-1) of the ramp) down
  // to an integer texel index, rather than interpolating against the raw
  // fractional position. This guarantees every stop (not just the first and
  // last) lands on an EXACT texel with zero blending — e.g. with 3 stops
  // and 1024 texels the middle stop's ideal position is texel 511.5, which
  // floors to 511. Without this snapping, the nearest texel would only be
  // ~99.9% of the way to that stop's color, and because OKLab's inverse
  // transform is steep near saturated primaries (red/green/blue sit at
  // corners of the sRGB gamut), even that tiny residual produces a
  // multi-unit sRGB error — enough to make an intended-to-be-pure stop look
  // slightly mixed.
  const breakpoints: number[] = [];
  for (let j = 0; j < stopCount; j++) {
    breakpoints.push(Math.floor((j * (RAMP_SIZE - 1)) / (stopCount - 1)));
  }

  const out = new Uint8Array(RAMP_SIZE * 4);

  // Walk texels and breakpoints together (both monotonically increasing)
  // so each texel is matched to its segment in a single forward sweep.
  let seg = 0;
  for (let i = 0; i < RAMP_SIZE; i++) {
    while (seg < stopCount - 2 && i > breakpoints[seg + 1]) {
      seg++;
    }

    const segStart = breakpoints[seg];
    const segEnd = breakpoints[seg + 1];
    // segEnd === segStart only when two breakpoints coincide (more stops
    // than texels available between them); localT is irrelevant then since
    // there's nothing to interpolate toward within this zero-width segment.
    const localT = segEnd === segStart ? 0 : (i - segStart) / (segEnd - segStart);

    // L and C lerp linearly like any other scalar. Hue does not: a straight
    // lerp of the angle would sweep the long way round whenever stops are
    // more than half a turn apart, so it goes through lerpHue() instead —
    // see that function and the top-of-file comment for why this matters.
    const [L0, C0, h0] = stopsOklch[seg];
    const [L1, C1, h1] = stopsOklch[seg + 1];
    const L = L0 + (L1 - L0) * localT;
    const C = C0 + (C1 - C0) * localT;
    const h = lerpHue(h0, C0, h1, C1, localT);

    const [, a, bLab] = oklchToOklab(L, C, h);
    const [r, g, b] = oklabToRgb(L, a, bLab);

    const idx = i * 4;
    out[idx] = clamp255(r);
    out[idx + 1] = clamp255(g);
    out[idx + 2] = clamp255(b);
    out[idx + 3] = 255;
  }

  return out;
}

/** Converts a 0-1 linear-ish sRGB channel to a clamped 0-255 byte. OKLab
 * round-trips can slightly overshoot 0-1 for saturated/out-of-gamut
 * midpoints, so clamping (rather than wrapping) is required here. */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
