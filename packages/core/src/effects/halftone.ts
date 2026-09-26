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
//
// GROUND AND BLEND come from the shared composite stage (chunks.ts, GROUND
// and COMPOSITE): shapes over the picture by default, or on paper. Shape
// size is the shared mark strength (RESPONSE). Halftone's shapes are
// static; shared motion is not exposed yet. See SPEC-marks.md.

import type { EffectDef, ParamValue } from "../types";
import {
  BLEND,
  COLOR_MODE,
  COMPOSITE,
  GROUND,
  RESPONSE,
  colorModeParams,
  groundParams,
  groundPicture,
  responseParams,
} from "./chunks";

const ROW = 0.8660254; // hex lattice row spacing, sqrt(3)/2

const CELL_FRAGMENT = `
${COLOR_MODE}
${RESPONSE}

void main() {
  vec3 sc = cellSource().rgb;
  float ink = markStrength(sc);

  // Ink color. Duotone inks every shape with u_ink. Palette inks each dot
  // with the nearest palette STOP to the un-inverted tone, so Invert flips
  // sizes and leaves colors, and the dots are flat palette colors rather
  // than a copy of the source.
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
${COLOR_MODE}
${BLEND}
${COMPOSITE}
${GROUND}

const float ROW = ${ROW};

vec4 lattice(vec2 k) {
  vec2 kk = clamp(k, vec2(0.0), u_gridSize - 1.0);
  return texture2D(u_cells, (kk + 0.5) / u_gridSize);
}

// The shape covering lattice coordinate g most, composited onto backdrop b
// (sRGB), returned in linear light. \`aa\` is the width, in lattice units,
// edges are ramped over.
vec3 shade(vec2 g, float aa, vec3 b) {
  bool hex = u_grid > 0.5;
  bool line = u_shape > 0.5 && u_shape < 1.5;
  vec2 unit = hex ? vec2(0.5, ROW) : vec2(1.0);
  float stride = hex ? 2.0 : 1.0;
  float j0 = floor(g.y);
  float bestMask = 0.0;
  vec3 bestInk = vec3(0.0);

  for (int dj = -1; dj <= 1; dj++) {
    float j = j0 + float(dj);
    float par = hex ? mod(j, 2.0) : 0.0;
    float dy = (g.y - (j + 0.5)) * unit.y;

    if (line) {
      float kl = stride * floor((g.x - 0.5 - par) / stride) + par;
      float f = (g.x - 0.5 - kl) / stride;
      vec4 v = mix(lattice(vec2(kl, j)), lattice(vec2(kl + stride, j)), f);
      float extent = min(0.5 * v.a * unit.y * u_radius, 1.0);
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
      float dist;
      float extent;
      if (u_shape < 0.5) {
        dist = length(d);
        extent = sqrt(v.a * (hex ? ROW : 1.0) / 3.14159265);
      } else {
        dist = max(abs(d.x), abs(d.y));
        extent = 0.5 * sqrt(v.a);
      }
      extent = min(extent * u_radius, 1.0);
      float ramp = aa + u_softness * extent;
      float mask = extent <= 0.0 ? 0.0 : clamp((extent - dist) / ramp + 0.5, 0.0, 1.0);
      if (mask > bestMask) { bestMask = mask; bestInk = v.rgb; }
    }
  }
  return compositeLinear(b, bestInk, bestMask);
}

void main() {
  float pitchRef = u_grid > 0.5 ? u_cellRef.x * 2.0 : u_cellRef.x;
  float px = 1.0 / (pitchRef * u_outputScale);
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
      vec2 fc = gl_FragCoord.xy + (vec2(float(sx), float(sy)) + 0.5) / n - 0.5;
      acc += shade(cellCoordAt(fc), px / n, backdropAt(fc));
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
    picture: groundPicture,
    fragment: CELL_FRAGMENT,
  },
  params: [
    ...groundParams({ ground: "image", blend: "screen", opacity: 1 }),
    { key: "grid", label: "Grid", type: "enum", options: [{ value: "square", label: "Square" }, { value: "hex", label: "Hex" }], default: "square" },
    {
      key: "shape",
      label: "Shape",
      type: "enum",
      options: [
        { value: "dot", label: "Dot" },
        { value: "line", label: "Line" },
        { value: "square", label: "Square" },
      ],
      default: "square",
    },
    // Lattice pitch in reference pixels (px at 1080p).
    { key: "size", label: "Size", min: 6, max: 160, step: 0.5, default: 20 },
    { key: "angle", label: "Angle", min: 0, max: 180, step: 1, default: 45 },
    // 1 = tone-accurate. Above 1 neighbouring shapes merge where largest.
    { key: "radius", label: "Radius", min: 0.2, max: 1.5, step: 0.01, default: 0.75 },
    { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01, default: 0.1 },
    ...responseParams({ contrast: 1.15 }),
    ...colorModeParams({ mode: "source", paperWhen: { key: "ground", in: ["paper"] } }),
  ],
  randomParams(rand) {
    const shapes = ["dot", "dot", "line", "square"];
    const modes = ["source", "duotone", "palette"];
    // On paper only normal and multiply read (a light sheet leaves screen
    // nothing to lighten); duotone ink is light when screened.
    const ground = rand() < 0.8 ? "image" : "paper";
    const blends = ground === "paper" ? ["normal", "multiply"] : ["normal", "multiply", "screen", "screen", "overlay", "softLight", "colorDodge"];
    const blend = blends[Math.floor(rand() * blends.length)];
    return {
      ground,
      blend,
      opacity: 0.6 + rand() * 0.4,
      blur: 0,
      grid: rand() < 0.5 ? "square" : "hex",
      shape: shapes[Math.floor(rand() * shapes.length)],
      size: Math.round(8 + rand() * 30),
      angle: Math.round(rand() * 180),
      radius: 0.7 + rand() * 0.7,
      softness: rand() < 0.7 ? 0.1 : rand() * 0.5,
      style: "filled",
      exposure: 0,
      contrast: 1.15,
      density: 1,
      colorMode: modes[Math.floor(rand() * modes.length)],
      ink: blend === "screen" || blend === "colorDodge" ? "#ffffff" : "#111111",
      paper: "#f4f1ea",
      invert: false,
    };
  },
};
