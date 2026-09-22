// "ASCII": the picture as a grid of characters, denser glyphs for more tone.
//
//   cell stage  per character cell: pick a glyph for the cell's tone, write
//               glyph index to alpha and the glyph's color to RGB
//   draw stage  per output pixel: look up the cell's glyph in the atlas
//
// Because the glyph index is decided in the cell buffer, a 900px preview and
// a 4K export always show the same character in the same cell.
//
// Glyphs are chosen by brightness. The sharper alternative is shape matching
// (Alex Harri's 6-sample shape vectors): it improves edges in photos, but on
// a smooth gradient all six samples are equal and it collapses to exactly
// this ramp. It would slot into the cell stage without touching the rest.

import type { EffectDef, ParamValue, TextureEnv } from "../types";
import { COLOR_MODE, colorModeParams } from "./chunks";
import { CELL_ASPECT, atlasGlyphHeight, buildAtlas, charsetInfo, toneLookup } from "./asciiAtlas";

const CELL_FRAGMENT = `
uniform float u_smooth;
uniform float u_cycle;
uniform float u_cycleAmount;
uniform float u_glyphCount;
uniform sampler2D u_lut;
${COLOR_MODE}

void main() {
  vec3 sc = cellSource().rgb;
  float tone = luma(sc);
  if (u_invert > 0.5) tone = 1.0 - tone;

  // The lookup places glyphs by measured ink coverage: R = the glyph just
  // below this tone, G = the one just above, B = how far between them.
  vec4 l = texture2D(u_lut, vec2((floor(tone * 255.0 + 0.5) + 0.5) / 256.0, 0.5));
  float lo = floor(l.r * 255.0 + 0.5);
  float hi = floor(l.g * 255.0 + 0.5);
  // Smooth: dither between the two neighbouring glyphs, so a gradient does
  // not band into flat fields of one character. The threshold is a per-cell
  // hash, not a Bayer matrix: with only ~10 glyphs an ordered pattern shows
  // up as mechanical "%=%=%=" stripes, where noise reads as hand-set type.
  float t = u_smooth > 0.5 ? 0.02 + 0.96 * hash12(cellIndex() + 0.5) : 0.5;
  float glyph = l.b > t ? hi : lo;

  // Cycle: every step each cell re-rolls its glyph among neighbours of
  // similar weight, so the picture flickers but stays readable. Blank cells
  // stay blank, or dark areas would fill with sparks.
  if (u_cycle > 0.0 && glyph > 0.5) {
    float h = hash12(cellIndex() + vec2(37.0, 17.0) * loopStep(u_cycle) + u_seed);
    float span = u_cycleAmount * u_glyphCount * 0.25;
    glyph = clamp(glyph + floor((h * 2.0 - 1.0) * span + 0.5), 1.0, u_glyphCount - 1.0);
  }

  // Glyph color. Tone already lives in the glyph's density, so source colors
  // are lifted most of the way to full brightness; using them as they are
  // would darken every dark area twice.
  vec3 color = sc;
  if (u_colorMode < 0.5) {
    float peak = max(max(sc.r, sc.g), max(sc.b, 1e-3));
    color = mix(sc, sc / peak, 0.75);
  } else if (u_colorMode < 1.5) {
    color = u_ink;
  } else {
    color = palette(toneIsRamp() ? rampPosition(sc) : luma(sc));
  }

  gl_FragColor = vec4(color, glyph / 255.0);
}
`;

const DRAW_FRAGMENT = `
uniform sampler2D u_atlas;
uniform vec2 u_atlasGrid;    // glyph columns, rows
uniform vec2 u_atlasSize;    // atlas size in texels
uniform vec2 u_glyphPx;      // one glyph's size in atlas texels (without gutter)
${COLOR_MODE}

void main() {
  vec4 cell = cellValue(cellIndexAt());
  float glyph = floor(cell.a * 255.0 + 0.5);
  vec2 slot = vec2(mod(glyph, u_atlasGrid.x), floor(glyph / u_atlasGrid.x));
  // Top-left texel of the glyph, inside its one-texel gutter. The atlas is a
  // canvas uploaded unflipped, so its row 0 is the top.
  vec2 origin = slot * (u_glyphPx + 2.0) + 1.0;

  // The atlas is rasterized at 64px or more and minified here by a box of
  // LINEAR taps sized to this output pixel's footprint: a small preview sees
  // the same letterforms as the export, filtered, rather than separately
  // hinted tiny ones. One tap per atlas texel the pixel spans, up to 6x6.
  vec2 local = cellLocal();
  vec2 texelsPerPx = u_glyphPx / cellPx();
  float n = clamp(ceil(max(texelsPerPx.x, texelsPerPx.y)), 1.0, 6.0);
  float a = 0.0;
  for (int j = 0; j < 6; j++) {
    for (int i = 0; i < 6; i++) {
      if (float(i) >= n || float(j) >= n) continue;
      vec2 o = ((vec2(float(i), float(j)) + 0.5) / n - 0.5) / cellPx();
      vec2 q = clamp(local + o, 0.0, 1.0);
      vec2 texel = origin + vec2(q.x, 1.0 - q.y) * u_glyphPx;
      a += texture2D(u_atlas, texel / u_atlasSize).a;
    }
  }
  a /= n * n;

  vec3 color = toSrgb(mix(toLinear(u_paper), toLinear(cell.rgb), a));
  gl_FragColor = vec4(color, 1.0);
}
`;

function cellOf(p: Record<string, ParamValue>): [number, number] {
  const size = p.size as number;
  return [Math.max(1, Math.round(size * CELL_ASPECT)), size];
}

function glyphHeight(env: TextureEnv): number {
  return atlasGlyphHeight(cellOf(env.params)[1] * env.outputScale);
}

export const ascii: EffectDef = {
  id: "ascii",
  label: "ASCII",
  fragment: DRAW_FRAGMENT,
  grid: { cell: cellOf, fragment: CELL_FRAGMENT },
  textures: [
    {
      uniform: "u_atlas",
      key: (env) => `${env.params.charset}|${env.fontFamily}|${glyphHeight(env)}`,
      build: (env) => buildAtlas(env.params.charset as string, env.fontFamily, glyphHeight(env)),
    },
    {
      uniform: "u_lut",
      key: (env) => `${env.params.charset}|${env.fontFamily}`,
      build: (env) => ({
        source: {
          data: toneLookup(charsetInfo(env.params.charset as string, env.fontFamily).coverage),
          width: 256,
          height: 1,
        },
        filter: "nearest",
        wrap: "clamp",
      }),
    },
  ],
  params: [
    {
      key: "charset",
      label: "Characters",
      type: "enum",
      options: [
        { value: "standard", label: "Standard" },
        { value: "dense", label: "Dense" },
        { value: "blocks", label: "Blocks" },
        { value: "minimal", label: "Minimal" },
        { value: "binary", label: "Binary" },
        { value: "katakana", label: "Katakana" },
      ],
      default: "standard",
    },
    // Character cell height in reference pixels (px at 1080p).
    { key: "size", label: "Size", min: 8, max: 96, step: 1, default: 24 },
    { key: "smooth", label: "Smooth", type: "bool", default: true },
    // Glyph re-rolls per second. 0 = static.
    { key: "cycle", label: "Cycle", min: 0, max: 12, step: 1, default: 0 },
    { key: "cycleAmount", label: "Cycle amount", min: 0, max: 1, step: 0.01, default: 0.3 },
    ...colorModeParams({ mode: "source", ink: "#e8ffe8", paper: "#000000", paperAlways: true }),
  ],
  randomParams(rand) {
    const sets = ["standard", "dense", "blocks", "minimal", "binary"];
    const modes = ["source", "duotone", "palette"];
    return {
      charset: sets[Math.floor(rand() * sets.length)],
      size: Math.round(14 + rand() * 30),
      smooth: true,
      cycle: 0,
      cycleAmount: 0.3,
      colorMode: modes[Math.floor(rand() * modes.length)],
      ink: "#e8ffe8",
      paper: "#000000",
      invert: false,
    };
  },
};
