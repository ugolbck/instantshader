// "Pixelate": the picture redrawn as a grid of flat cells. The simplest grid
// effect, and the reference for how one is built:
//
//   cell stage  one fragment per cell: take the input averaged over the cell
//               (cellSource), optionally posterize it
//   draw stage  one fragment per output pixel: coverage() paints the cell
//               buffer, then optional gap lines are laid over it
//
// `size` is in reference pixels (px at 1080p), so a 24 is 24px cells in a
// 1920x1080 export, 48px cells at 4K, and the same 80x45 cells in both.

import type { EffectDef } from "../types";

const CELL_FRAGMENT = `
uniform float u_levels;

void main() {
  vec3 c = cellSource().rgb;
  // Posterize per channel. Rounds to the nearest level, so black and white
  // stay put. levels = 1 would divide by zero and means nothing; 0 is "off".
  if (u_levels >= 2.0) {
    float n = u_levels - 1.0;
    c = floor(c * n + 0.5) / n;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const DRAW_FRAGMENT = `
uniform float u_gap;
uniform vec3 u_gapColor;

void main() {
  vec3 color = coverage();
  if (u_gap > 0.0) {
    // A gap line is u_gap of a cell wide, centred on every cell boundary.
    // Its weight is the exact share of this output pixel it covers, and the
    // blend happens in linear light, for the same reason coverage() works
    // that way: a smoothstep edge in gamma space draws sub-pixel lines far
    // too heavy, so a small preview would look darker than its own export.
    vec2 px = cellPx();
    vec2 d = min(cellLocal(), 1.0 - cellLocal()) * px;   // px to nearest boundary
    vec2 hw = 0.5 * u_gap * px;                           // line half-width in px
    vec2 cov = clamp(min(hw, d + 0.5) - max(-hw, d - 0.5), 0.0, 1.0);
    float m = 1.0 - (1.0 - cov.x) * (1.0 - cov.y);
    color = toSrgb(mix(toLinear(color), toLinear(u_gapColor), m));
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

export const pixelate: EffectDef = {
  id: "pixelate",
  label: "Pixelate",
  fragment: DRAW_FRAGMENT,
  grid: {
    cell: (p) => [p.size as number, p.size as number],
    fragment: CELL_FRAGMENT,
  },
  params: [
    { key: "size", label: "Size", min: 2, max: 160, step: 1, default: 24 },
    // Colors per channel. 0 = keep full color.
    { key: "levels", label: "Levels", min: 0, max: 16, step: 1, default: 0 },
    // Grid lines, as a fraction of the cell. Gives the LED-wall / mosaic look.
    { key: "gap", label: "Gap", min: 0, max: 0.4, step: 0.01, default: 0 },
    { key: "gapColor", label: "Gap color", type: "color", default: "#000000" },
  ],
  randomParams(rand) {
    return {
      size: Math.round(10 + rand() * 50),
      levels: rand() < 0.5 ? 0 : Math.round(3 + rand() * 5),
      gap: rand() < 0.6 ? 0 : 0.05 + rand() * 0.15,
      gapColor: "#000000",
    };
  },
};
