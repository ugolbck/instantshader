// GLSL shared by every effect, plus the param defs that go with it. The
// stack renderer prepends BASE_UNIFORMS + EFFECT_COMMON + one of the three
// stage preambles to an effect's fragment source, the same way BASE_UNIFORMS
// alone is prepended to a generator's.

import type { EffectParamDef, ParamValue } from "../types";

/** sRGB transfer functions. Blending and averaging must happen in linear
 * light: a fine black/white checkerboard averaged in gamma space comes out
 * sRGB 128 where the eye (and a downscaled export) sees 188. */
export const COLOR_MATH: string = `
vec3 toLinear(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 toSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

/**
 * Available to every effect stage.
 *
 * - `loopStep(rate)`: integer step counter for motion that jumps instead of
 *   gliding. Exactly periodic when looping, because it counts a whole number
 *   of steps per loop and u_time itself wraps at u_loop.
 * - `hash12` / `hash22`: Dave Hoskins' sine-free hashes. The classic
 *   fract(sin(x) * 43758.5) returns different values on different GPUs,
 *   which would make a saved design animate differently per machine.
 * - `luma`: Rec.709 weights on GAMMA-ENCODED sRGB, on purpose. Thresholding
 *   in gamma space is what every dither tool does and what users compare
 *   against; see SPEC-effects.md 9.1.
 */
export const EFFECT_COMMON: string = `
uniform vec2 u_refSize;       // frame size in reference pixels (16:9 = 1920x1080)
uniform float u_outputScale;  // device pixels per reference pixel
${COLOR_MATH}
float loopStep(float rate) {
  if (rate <= 0.0) return 0.0;
  if (u_loop <= 0.0) return floor(u_time * rate);
  float n = max(1.0, floor(rate * u_loop + 0.5));
  return min(floor(u_time / u_loop * n), n - 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

/** Soft effects: one fragment per output pixel, reading the layer below. */
export const SOFT_PREAMBLE: string = `
uniform sampler2D u_source;   // the layer below, frame size
vec4 source(vec2 uv) { return texture2D(u_source, uv); }
// This pixel in reference pixels, origin at the frame centre.
vec2 refCoord() { return (gl_FragCoord.xy - 0.5 * u_resolution) / u_outputScale; }
// Reference pixels back to 0-1 frame UV, for sampling u_source.
vec2 refToUv(vec2 r) { return r * u_outputScale / u_resolution + 0.5; }
`;

/** Cell stage of a grid effect: one fragment per CELL. */
export const CELL_PREAMBLE: string = `
uniform sampler2D u_source;   // cell source: one texel per cell, already averaged
uniform vec2 u_gridSize;      // cols, rows
uniform vec2 u_cellRef;       // cell size in reference pixels
uniform float u_gridAngle;    // radians; 0 unless the effect uses a lattice
// Integer cell coordinates with the origin at the grid (= frame) centre.
// Index patterns by this, never by gl_FragCoord of the output.
vec2 cellIndex() { return floor(gl_FragCoord.xy) - 0.5 * u_gridSize; }
// The input picture averaged over this cell.
vec4 cellSource() { return texture2D(u_source, (floor(gl_FragCoord.xy) + 0.5) / u_gridSize); }
`;

/**
 * Draw stage of a grid effect: one fragment per output pixel, reading the
 * cell buffer.
 *
 * coverage() is the default draw stage: exact area coverage of this output
 * pixel's footprint over the cells it touches, blended in linear light. It
 * is libretro's "pixellate" filter with gamma-correct blending. When a cell
 * spans a whole number of output pixels the footprint sits inside one cell
 * and the texel is returned untouched, so 1080p and 4K exports are exact
 * nearest-neighbour. 3x3 taps cover footprints up to 3 cells wide, i.e.
 * down to 0.5 output pixels per cell.
 */
export const DRAW_PREAMBLE: string = `
uniform sampler2D u_cells;    // cell buffer, NEAREST, sRGB-encoded
uniform vec2 u_gridSize;
uniform vec2 u_cellRef;
uniform float u_gridAngle;    // radians; 0 unless the effect uses a lattice
vec2 cellPx() { return u_cellRef * u_outputScale; }
// Continuous cell coordinate of this output pixel: integer part is the cell
// (0-based from the grid's bottom-left), fraction is the position inside it.
// The angle branch is skipped for ordinary grids so their arithmetic, and
// with it the exactness of whole-pixel cells, is untouched.
vec2 cellCoordAt(vec2 fragCoord) {
  vec2 p = fragCoord - 0.5 * u_resolution;
  if (u_gridAngle != 0.0) {
    float c = cos(u_gridAngle);
    float s = sin(u_gridAngle);
    p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  }
  return p / cellPx() + 0.5 * u_gridSize;
}
vec2 cellCoord() { return cellCoordAt(gl_FragCoord.xy); }
vec2 cellIndexAt() { return floor(cellCoord()) - 0.5 * u_gridSize; }
vec2 cellLocal() { return fract(cellCoord()); }
// Raw cell-buffer texel for a centred cell index (as cellIndexAt returns).
vec4 cellValue(vec2 index) {
  vec2 k = clamp(index + 0.5 * u_gridSize, vec2(0.0), u_gridSize - 1.0);
  return texture2D(u_cells, (k + 0.5) / u_gridSize);
}
vec3 coverage() {
  vec2 c = cellCoord();
  vec2 h = 0.5 / cellPx();
  vec2 lo = c - h;
  vec2 hi = c + h;
  vec2 base = floor(c);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  vec3 best = vec3(0.0);
  float bestW = -1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 k = base + vec2(float(i), float(j));
      vec2 ov = max(vec2(0.0), min(hi, k + 1.0) - max(lo, k));
      float w = ov.x * ov.y;
      if (w <= 0.0) continue;
      vec2 kk = clamp(k, vec2(0.0), u_gridSize - 1.0);
      vec3 v = texture2D(u_cells, (kk + 0.5) / u_gridSize).rgb;
      if (w > bestW) { bestW = w; best = v; }
      acc += w * toLinear(v);
      wsum += w;
    }
  }
  // Footprint (almost) entirely inside one cell: return the texel itself
  // rather than a decode/encode round trip of it.
  if (bestW >= 0.9999 * 4.0 * h.x * h.y) return best;
  return toSrgb(acc / wsum);
}
`;

/** Draw stage used when a grid effect does not supply its own. */
export const COVERAGE_DRAW: string = `
void main() {
  gl_FragColor = vec4(coverage(), 1.0);
}
`;

/**
 * Color modes, shared by Dither, Halftone and ASCII so the params and the
 * behaviour are identical across them:
 *
 * - source:  keep the source's colors (the effect still quantizes/masks them)
 * - duotone: tone 0 -> ink, tone 1 -> paper
 * - palette: tone -> the stack's palette ramp
 *
 * toneOf() is what "tone" means. Normally it is luma. In palette mode
 * directly over a GENERATOR it is instead the color's position on the
 * palette ramp, recovered by nearest-color search. A generator's colors came
 * from that ramp, so this hands each cell back the exact ramp coordinate the
 * generator used and the effect reproduces the gradient's own color layout.
 * Luma would only do that for palettes that happen to run dark to light; a
 * pink -> blue -> yellow palette would come out rearranged. Over media, or
 * over another effect, there is no ramp coordinate to recover and tone stays
 * luma (a gradient map).
 *
 * paletteStop() snaps a tone to the nearest of the palette's stops
 * (u_paletteStops is the stop count). Halftone and ASCII use it in palette
 * mode: they do not quantize tone the way Dither's `levels` does, so
 * without the snap, palette mode over a generator handed back the exact
 * source color and looked identical to source mode. Snapped, each cell is
 * one of the palette's own colors, flat.
 *
 * The search is 33 coarse + 17 fine ramp samples. That is affordable
 * because tone is evaluated per cell or per lattice point, not per pixel.
 * The ends snap to exactly 0 and 1: generators clamp their coordinate, so
 * large flat areas sit at an end stop, and 8-bit rounding would otherwise
 * leave them a hair inside the ramp and sprinkle them with the next level.
 */
export const COLOR_MODE: string = `
uniform float u_colorMode;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform float u_invert;
uniform float u_sourceIsRamp;   // 1 when this layer reads a generator directly
uniform float u_paletteStops;   // number of colors in the palette
float rampPosition(vec3 c) {
  float best = 0.0;
  float bd = 1e9;
  for (int i = 0; i <= 32; i++) {
    float t = float(i) / 32.0;
    vec3 d = palette(t) - c;
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = t; }
  }
  float lo = best - 1.0 / 32.0;
  for (int i = 0; i <= 16; i++) {
    float t = clamp(lo + float(i) / 256.0, 0.0, 1.0);
    vec3 d = palette(t) - c;
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = t; }
  }
  if (best > 1.0 - 1.5 / 256.0) return 1.0;
  if (best < 1.5 / 256.0) return 0.0;
  return best;
}
bool toneIsRamp() { return u_colorMode > 1.5 && u_sourceIsRamp > 0.5; }
float toneOf(vec3 c) {
  float t = toneIsRamp() ? rampPosition(c) : luma(c);
  return u_invert > 0.5 ? 1.0 - t : t;
}
vec3 paletteStop(float tone) {
  float n = max(u_paletteStops - 1.0, 1.0);
  return palette(floor(tone * n + 0.5) / n);
}
vec3 colorize(float tone, vec3 src) {
  if (u_colorMode < 0.5) return src;
  if (u_colorMode < 1.5) return mix(u_ink, u_paper, tone);
  return palette(tone);
}
`;

export type ColorMode = "source" | "duotone" | "palette";

/** The param defs that go with COLOR_MODE. `paperAlways` is for effects
 * where paper is a visible ground in every mode (ASCII, Halftone). */
export function colorModeParams(opts: {
  mode: ColorMode;
  ink?: string;
  paper?: string;
  paperAlways?: boolean;
  /** Show paper only while this holds (mark effects: a paper ground). Wins over paperAlways. */
  paperWhen?: { key: string; in: ParamValue[] };
}): EffectParamDef[] {
  return [
    {
      key: "colorMode",
      label: "Colors",
      type: "enum",
      options: [
        { value: "source", label: "Source" },
        { value: "duotone", label: "Duotone" },
        { value: "palette", label: "Palette" },
      ],
      default: opts.mode,
    },
    {
      key: "ink",
      label: "Ink",
      type: "color",
      default: opts.ink ?? "#111111",
      when: { key: "colorMode", in: ["duotone"] },
    },
    {
      key: "paper",
      label: "Paper",
      type: "color",
      default: opts.paper ?? "#f4f1ea",
      ...(opts.paperWhen
        ? { when: opts.paperWhen }
        : opts.paperAlways
          ? {}
          : { when: { key: "colorMode", in: ["duotone"] } }),
    },
    { key: "invert", label: "Invert", type: "bool", default: false },
  ];
}

/**
 * Blend modes, W3C Compositing and Blending Level 1, computed on
 * gamma-encoded sRGB like CSS and every image editor. b is the backdrop, s
 * the source (the mark or the filter's colour). Overlay is hard light with
 * the roles swapped. Color dodge: 0 where b is 0, else min(1, b / (1 - s)).
 */
export const BLEND: string = `
uniform float u_blend;
vec3 blendScreen(vec3 b, vec3 s) { return b + s - b * s; }
vec3 blendHardLight(vec3 b, vec3 s) {
  return mix(b * 2.0 * s, blendScreen(b, 2.0 * s - 1.0), step(0.5, s));
}
vec3 blendSoftLight(vec3 b, vec3 s) {
  vec3 d = mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25)));
  return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
}
vec3 blendColorDodge(vec3 b, vec3 s) {
  return min(vec3(1.0), b / max(1.0 - s, vec3(1e-5))) * step(1e-5, b);
}
vec3 blendOf(vec3 b, vec3 s) {
  if (u_blend < 0.5) return s;
  if (u_blend < 1.5) return b * s;
  if (u_blend < 2.5) return blendScreen(b, s);
  if (u_blend < 3.5) return blendHardLight(s, b);
  if (u_blend < 4.5) return blendSoftLight(b, s);
  return blendColorDodge(b, s);
}
`;

/** Draw stage: the layer below and the blend-then-fade composite. The
 * blended colour is faded in by coverage x opacity in linear light, so an
 * antialiased edge keeps its true weight. */
export const COMPOSITE: string = `
uniform float u_opacity;
uniform sampler2D u_picture;
vec3 pictureAt(vec2 fc) { return texture2D(u_picture, fc / u_resolution).rgb; }
vec3 compositeLinear(vec3 b, vec3 s, float a) {
  return mix(toLinear(b), toLinear(blendOf(b, s)), clamp(a * u_opacity, 0.0, 1.0));
}
`;

/** Mark effects: what the marks are drawn on. */
export const GROUND: string = `
uniform float u_ground;
vec3 backdropAt(vec2 fc) { return u_ground < 0.5 ? pictureAt(fc) : u_paper; }
`;

/** Filter effects (a whole replacement picture per cell) over the layer
 * below. Normal at full opacity hands the colour back untouched: no linear
 * round trip, so whole-pixel cells stay exact at 1080p and 4K. */
export const FILTER_COMPOSITE: string = `
vec3 overPicture(vec3 s) {
  if (u_blend < 0.5 && u_opacity >= 1.0) return s;
  return toSrgb(compositeLinear(pictureAt(gl_FragCoord.xy), s, 1.0));
}
`;

/**
 * Cell stage of a mark effect: the cell's tone becomes a mark strength in
 * 0..1. See SPEC-marks.md, Response.
 *
 * Direction: marks grow where they show. On an image ground a darkening
 * blend (multiply) grows them in the darks and every other blend in the
 * brights; on paper they grow away from the paper. Invert flips it.
 *
 * Motion multiplies the strength, so blank cells stay blank. Its angular
 * speed is snapped to whole cycles per loop and floored at one: it is the
 * effect's own motion, and freezing it on a short loop would read as broken.
 *
 * No shipped effect declares motion, motionSpeed or motionAmount yet (see
 * motionParams() below), so these uniforms are unset and read as 0: motion
 * is "none" and the strength above is unmodulated. The GLSL stays wired up
 * because motion ships later, once effects get a clock independent of the
 * source's own speed and pause; see SPEC-marks.md.
 */
export const RESPONSE: string = `
uniform float u_style;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_density;
uniform float u_ground;
uniform float u_blend;
uniform float u_motion;
uniform float u_motionSpeed;
uniform float u_motionAmount;

bool growsInBrights() {
  if (u_ground > 0.5) return luma(u_paper) < 0.5;
  return abs(u_blend - 1.0) > 0.5;
}

float motionAt(vec2 cell) {
  if (u_motion < 0.5) return 0.0;
  float w = TAU * u_motionSpeed;
  if (u_loop > 0.0) w = TAU * max(1.0, floor(u_motionSpeed * u_loop + 0.5)) / u_loop;
  float ph = w * u_time;
  if (u_motion < 1.5) return sin(ph);
  if (u_motion < 2.5) {
    // 1.5 waves per frame height, travelling along a fixed diagonal.
    vec2 pos = cell * u_cellRef / u_refSize.y;
    return sin(ph - TAU * 1.5 * dot(pos, vec2(0.857, 0.514)));
  }
  return sin(ph + TAU * hash12(cell + 13.1));
}

float markStrength(vec3 c) {
  float tone = u_style < 0.5 ? luma(c) : 0.5;
  tone = clamp(tone * exp2(2.0 * u_exposure), 0.0, 1.0);
  float s = growsInBrights() ? tone : 1.0 - tone;
  if (u_invert > 0.5) s = 1.0 - s;
  s = clamp((s - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  s = clamp(s * (1.0 + u_motionAmount * motionAt(cellIndex())), 0.0, 1.0);
  if (hash12(cellIndex() + vec2(71.3, 19.7)) >= u_density) s = 0.0;
  return s;
}
`;

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "softLight" | "colorDodge";

/** Append only: the uniform is the option's index. */
export const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "softLight", label: "Soft light" },
  { value: "colorDodge", label: "Color dodge" },
];

export function blendParams(d: { blend: BlendMode; opacity: number }): EffectParamDef[] {
  return [
    { key: "blend", label: "Blend", type: "enum", options: BLEND_OPTIONS, default: d.blend },
    { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01, default: d.opacity },
  ];
}

export function groundParams(d: { ground: "image" | "paper"; blend: BlendMode; opacity: number }): EffectParamDef[] {
  return [
    {
      key: "ground",
      label: "Ground",
      type: "enum",
      options: [
        { value: "image", label: "Image" },
        { value: "paper", label: "Paper" },
      ],
      default: d.ground,
    },
    ...blendParams(d),
    // Backdrop blur in reference px (px at 1080p).
    { key: "blur", label: "Blur", min: 0, max: 40, step: 0.5, default: 0, when: { key: "ground", in: ["image"] } },
  ];
}

export function responseParams(d: { contrast: number }): EffectParamDef[] {
  return [
    {
      key: "style",
      label: "Style",
      type: "enum",
      options: [
        { value: "filled", label: "Filled" },
        { value: "uniform", label: "Uniform" },
      ],
      default: "filled",
    },
    { key: "exposure", label: "Exposure", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "contrast", label: "Contrast", min: 0, max: 2, step: 0.01, default: d.contrast },
    { key: "density", label: "Density", min: 0, max: 1, step: 0.01, default: 1 },
  ];
}

const MOVING = { key: "motion", in: ["breathe", "wave", "twinkle"] };

export function motionParams(): EffectParamDef[] {
  return [
    {
      key: "motion",
      label: "Motion",
      type: "enum",
      options: [
        { value: "none", label: "None" },
        { value: "breathe", label: "Breathe" },
        { value: "wave", label: "Wave" },
        { value: "twinkle", label: "Twinkle" },
      ],
      default: "none",
    },
    // Cycles per second; whole cycles per loop when looping.
    { key: "motionSpeed", label: "Motion speed", min: 0.05, max: 2, step: 0.05, default: 0.5, when: MOVING },
    { key: "motionAmount", label: "Motion amount", min: 0, max: 1, step: 0.01, default: 0.5, when: MOVING },
  ];
}

/** grid.picture for mark effects: blur only applies to an image ground. */
export function groundPicture(p: Record<string, ParamValue>): { blur: number } {
  return { blur: p.ground === "image" ? (p.blur as number) : 0 };
}
