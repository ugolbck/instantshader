// "Halftone": the picture as a lattice of shapes whose size follows tone,
// the way print does it.
//
// A grid effect on a LATTICE (see EffectDef.grid.lattice): the grid is
// rotated to the screen angle and its pitch is not rounded, because the draw
// stage paints soft antialiased shapes and nothing has to land on whole
// pixels. What the lattice buys is the same thing the cell buffer buys the
// other effects: every dot's size and color is computed ONCE, from the source
// averaged over that dot's cell, into a buffer that is the same at every
// output size. A 900px preview and a 4K export therefore draw identical dots
// and differ in edge sharpness only. (Sampling the source per output pixel
// instead made each dot's size depend on one noisy texel of a
// resolution-dependent texture, and preview and export visibly disagreed.)
//
//   cell stage  per lattice point: RGB = ink color, A = ink amount (0-1)
//   draw stage  per output pixel: visit the 3x3 lattice points around it (a
//               shape may be larger than its own cell and spill into its
//               neighbours'), keep the shape that covers the pixel most
//
// A hex lattice is stored at half-cell column pitch, with lattice points on
// texels where column + row is even; that is what lets one plain rectangular
// buffer hold rows that are offset by half a cell.
//
// Dot AREA follows tone, so dot radius goes with the square root of it. A
// radius that followed tone linearly would render midtones far too light.

import type { EffectDef, ParamValue } from "../types";
import { COLOR_MODE, colorModeParams } from "./chunks";

const ROW = 0.8660254; // hex lattice row spacing, sqrt(3)/2

const CELL_FRAGMENT = `
uniform float u_contrast;
${COLOR_MODE}

void main() {
  vec3 sc = cellSource().rgb;

  // Ink amount. Halftone sizes its shapes by brightness in every color mode,
  // so this is luma even where toneOf() would return a ramp position.
  float tone = luma(sc);
  if (u_invert > 0.5) tone = 1.0 - tone;
  float ink = clamp((1.0 - tone - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  // Ink color. Duotone inks every shape with u_ink (colorize() would mix
  // toward paper by tone, which is dither's meaning of duotone). Palette
  // inks each dot with the nearest palette STOP to the un-inverted tone, so
  // Invert flips sizes and leaves colors, and the dots are flat palette
  // colors rather than a copy of the source.
  vec3 color = sc;
  if (u_colorMode > 1.5) color = paletteStop(toneIsRamp() ? rampPosition(sc) : luma(sc));
  else if (u_colorMode > 0.5) color = u_ink;

  gl_FragColor = vec4(color, ink);
}
`;

const DRAW_FRAGMENT = `
uniform float u_grid;
uniform float u_shape;
uniform float u_radius;
uniform float u_softness;
uniform float u_pulse;
${COLOR_MODE}

const float ROW = ${ROW};

vec4 lattice(vec2 k) {
  vec2 kk = clamp(k, vec2(0.0), u_gridSize - 1.0);
  return texture2D(u_cells, (kk + 0.5) / u_gridSize);
}

// The shape covering lattice coordinate g most, blended over paper, in
// linear light. \`aa\` is the width, in lattice units, edges are ramped over.
vec3 shade(vec2 g, float aa, float w) {
  bool hex = u_grid > 0.5;
  bool line = u_shape > 0.5 && u_shape < 1.5;
  // Texel units -> lattice units (1 = the pitch the user set as Size).
  vec2 unit = hex ? vec2(0.5, ROW) : vec2(1.0);
  float stride = hex ? 2.0 : 1.0;
  float j0 = floor(g.y);
  float bestMask = 0.0;
  vec3 bestInk = vec3(0.0);

  for (int dj = -1; dj <= 1; dj++) {
    float j = j0 + float(dj);
    // Hex: lattice points sit where column + row is even.
    float par = hex ? mod(j, 2.0) : 0.0;
    float dy = (g.y - (j + 0.5)) * unit.y;

    if (line) {
      // Lines run along the lattice rows. Their width is interpolated between
      // the two lattice points that bracket this pixel, so it varies smoothly
      // instead of stepping once per cell.
      float kl = stride * floor((g.x - 0.5 - par) / stride) + par;
      float f = (g.x - 0.5 - kl) / stride;
      vec4 v = mix(lattice(vec2(kl, j)), lattice(vec2(kl + stride, j)), f);
      float swell = 1.0 + 0.25 * u_pulse * sin(w * u_time + 0.22 * (j - 0.5 * u_gridSize.y) + u_seed);
      float extent = min(0.5 * v.a * unit.y * u_radius * swell, 1.0);
      float ramp = aa + u_softness * extent;
      float mask = extent <= 0.0 ? 0.0 : clamp((extent - abs(dy)) / ramp + 0.5, 0.0, 1.0);
      if (mask > bestMask) { bestMask = mask; bestInk = v.rgb; }
      continue;
    }

    float k0 = stride * floor((g.x - 0.5 - par) / stride + 0.5) + par;
    for (int di = -1; di <= 1; di++) {
      vec2 k = vec2(k0 + stride * float(di), j);
      vec4 v = lattice(k);
      vec2 d = vec2((g.x - (k.x + 0.5)) * unit.x, dy);
      vec2 id = k - 0.5 * u_gridSize;
      float swell = 1.0 + 0.25 * u_pulse * sin(w * u_time + dot(id * unit, vec2(0.35, 0.22)) + u_seed);

      float dist;
      float extent;
      if (u_shape < 0.5) {
        // Dot: area pi * rho^2 out of a cell of area 1 (square) or ROW (hex).
        dist = length(d);
        extent = sqrt(v.a * (hex ? ROW : 1.0) / 3.14159265);
      } else {
        dist = max(abs(d.x), abs(d.y));
        extent = 0.5 * sqrt(v.a);
      }
      extent = min(extent * u_radius * swell, 1.0);

      // Coverage of a straight edge by a box is linear in the distance to
      // it. Softness widens that ramp into a blur.
      float ramp = aa + u_softness * extent;
      float mask = extent <= 0.0 ? 0.0 : clamp((extent - dist) / ramp + 0.5, 0.0, 1.0);
      if (mask > bestMask) { bestMask = mask; bestInk = v.rgb; }
    }
  }
  return mix(toLinear(u_paper), toLinear(bestInk), bestMask);
}

void main() {
  float pitchRef = u_grid > 0.5 ? u_cellRef.x * 2.0 : u_cellRef.x;
  // One output pixel, in lattice units.
  float px = 1.0 / (pitchRef * u_outputScale);

  // Pulse: every shape swells and shrinks, phase-shifted across the lattice
  // so the swell travels through the frame instead of throbbing in lockstep.
  // Snapped to whole cycles per loop and floored at one: unlike a generator's
  // slow secondary swell, this is the effect's only motion, so freezing it at
  // short loops (loopFreq's choice) would read as the knob being broken.
  float w = 0.8;
  if (u_loop > 0.0) w = TAU * max(1.0, floor(w * u_loop / TAU + 0.5)) / u_loop;

  // Supersampled: n x n samples per pixel, each ramping its edges over 1/n
  // of a pixel. One sample with a one-pixel linear ramp is exact only for a
  // straight edge parallel to the pixel grid; on a 5px preview dot every
  // edge pixel is curved and diagonal, and the error showed up as the
  // preview disagreeing with its own downscaled export. Small shapes get
  // 4x4 (they are the ones that need it, and a frame of small shapes is a
  // small frame or a cheap one); large shapes get 2x2. Averaged in linear
  // light, so fine dots in a small preview have the brightness of the export
  // seen from afar.
  float n = pitchRef * u_outputScale < 20.0 ? 4.0 : 2.0;
  vec3 acc = vec3(0.0);
  for (int sy = 0; sy < 4; sy++) {
    for (int sx = 0; sx < 4; sx++) {
      if (float(sx) >= n || float(sy) >= n) continue;
      vec2 o = (vec2(float(sx), float(sy)) + 0.5) / n - 0.5;
      acc += shade(cellCoordAt(gl_FragCoord.xy + o), px / n, w);
    }
  }
  gl_FragColor = vec4(toSrgb(acc / (n * n)), 1.0);
}
`;

function cellOf(p: Record<string, ParamValue>): [number, number] {
  const size = p.size as number;
  return p.grid === "hex" ? [size / 2, size * ROW] : [size, size];
}

export const halftone: EffectDef = {
  id: "halftone",
  label: "Halftone",
  fragment: DRAW_FRAGMENT,
  grid: {
    cell: cellOf,
    lattice: (p) => ({ angle: p.angle as number }),
    fragment: CELL_FRAGMENT,
  },
  params: [
    {
      key: "grid",
      label: "Grid",
      type: "enum",
      options: [
        { value: "square", label: "Square" },
        { value: "hex", label: "Hex" },
      ],
      default: "square",
    },
    {
      key: "shape",
      label: "Shape",
      type: "enum",
      options: [
        { value: "dot", label: "Dot" },
        { value: "line", label: "Line" },
        { value: "square", label: "Square" },
      ],
      default: "dot",
    },
    // Lattice pitch in reference pixels (px at 1080p).
    { key: "size", label: "Size", min: 6, max: 160, step: 0.5, default: 10 },
    { key: "angle", label: "Angle", min: 0, max: 180, step: 1, default: 45 },
    // 1 = tone-accurate, but at the default pitch it reads washed out and
    // empty; 1.4 lets neighbouring shapes merge in the darks, which is what
    // makes the picture read.
    { key: "radius", label: "Radius", min: 0.2, max: 1.5, step: 0.01, default: 1.4 },
    { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: "contrast", label: "Contrast", min: 0, max: 2, step: 0.01, default: 1.15 },
    { key: "pulse", label: "Pulse", min: 0, max: 1, step: 0.01, default: 0 },
    ...colorModeParams({ mode: "palette", paperAlways: true }),
  ],
  randomParams(rand) {
    const shapes = ["dot", "dot", "line", "square"];
    const modes = ["source", "duotone", "palette"];
    return {
      grid: rand() < 0.5 ? "square" : "hex",
      shape: shapes[Math.floor(rand() * shapes.length)],
      size: Math.round(8 + rand() * 30),
      angle: Math.round(rand() * 180),
      radius: 1.2 + rand() * 0.3,
      softness: rand() < 0.7 ? 0.1 : rand() * 0.5,
      contrast: 1.15,
      pulse: 0,
      colorMode: modes[Math.floor(rand() * modes.length)],
      ink: "#111111",
      paper: "#f4f1ea",
      invert: false,
    };
  },
};
