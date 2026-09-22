// "Dither": the picture reduced to a few levels, with a threshold pattern
// standing in for the tones in between. A grid effect with the default
// coverage draw stage, so everything happens in the cell stage:
//
//   tone c in [0,1], n levels, threshold t strictly inside (0,1)
//   q = floor(c * (n - 1) + t) / (n - 1)
//
// That exact form matters. It maps pure black and pure white to themselves
// for every t, and its mean over the pattern equals c, so the dither adds no
// brightness bias. The widely copied floor(c * n + t) / n overflows at white,
// and uncentred thresholds (M / N^2 instead of (M + 0.5) / N^2) shift every
// tone by half a step.
//
// Patterns are indexed by the CELL index, never by the output pixel, so an
// 8x8 Bayer tile covers the same patch of the picture in a 900px preview and
// in a 4K export.
//
// Not here, on purpose: error diffusion (Floyd-Steinberg, Atkinson). Each
// pixel depends on its neighbours' rounding error, which a fragment shader
// cannot express. Blue noise is the parallel pattern that looks closest.

import type { EffectDef } from "../types";
import { COLOR_MODE, colorModeParams } from "./chunks";
import { BLUE_NOISE_SIZE, blueNoiseBytes } from "./blueNoise";

const CELL_FRAGMENT = `
uniform float u_pattern;
uniform float u_levels;
uniform float u_bias;
uniform float u_linear;
uniform float u_shimmer;
uniform sampler2D u_noise;
${COLOR_MODE}

// Recursive Bayer matrices without bit operations (GLSL ES 1.0 has none).
// bayer2 yields M/4 for the canonical 2x2 matrix [0 2; 3 1]; each larger
// size interleaves a half-resolution copy. Verified against the canonical
// 4x4 and 8x8 matrices value for value. The mod() keeps the square term
// exact at any cell index and makes negative indices (the grid is centred on
// the frame) tile correctly.
float bayer2(vec2 a) {
  a = mod(floor(a), 2.0);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

// Centred thresholds: (M + 0.5) / N^2, strictly inside (0,1). The noise
// texture gets the same treatment, since its raw 0 would otherwise never
// fire and its raw 255 (= 1.0) would light pure black.
float threshold(vec2 idx) {
  if (u_pattern < 0.5) return bayer2(idx) + 0.5 / 4.0;
  if (u_pattern < 1.5) return bayer4(idx) + 0.5 / 16.0;
  if (u_pattern < 2.5) return bayer8(idx) + 0.5 / 64.0;
  float v = texture2D(u_noise, (mod(idx, ${BLUE_NOISE_SIZE}.0) + 0.5) / ${BLUE_NOISE_SIZE}.0).r;
  return (floor(v * 255.0 + 0.5) + 0.5) / 256.0;
}

// gammaTone: v is a gamma-encoded brightness, so the linear-light option
// applies. A ramp position (see toneOf) is not a brightness and skips it.
float quantize(float v, float t, bool gammaTone) {
  float n = max(u_levels, 2.0) - 1.0;
  v = clamp(v + u_bias, 0.0, 1.0);
  // Optional linear-light thresholding: physically correct brightness, at
  // the cost of starving dark gradients (sRGB 0-0.25 is linear 0-0.05, where
  // a 4x4 matrix has no level at all). Off by default; see SPEC 9.1.
  bool lin = gammaTone && u_linear > 0.5;
  if (lin) v = toLinear(vec3(v)).r;
  float q = floor(v * n + t) / n;
  if (lin) q = toSrgb(vec3(q)).r;
  return q;
}

void main() {
  vec3 c = cellSource().rgb;

  // Shimmer: every step, slide the whole pattern by a hashed whole number of
  // cells. Each frame stays spatially identical (still Bayer, still blue
  // noise); only its position jumps, which reads as film grain rather than
  // as a crawling pattern. loopStep makes it exactly periodic.
  vec2 idx = cellIndex();
  if (u_shimmer > 0.0) {
    idx += floor(hash22(vec2(loopStep(u_shimmer), u_seed) + 0.5) * ${BLUE_NOISE_SIZE}.0);
  }
  float t = threshold(idx);

  vec3 color;
  if (u_colorMode < 0.5) {
    // Source colors: one shared threshold, quantized per channel.
    if (u_invert > 0.5) c = 1.0 - c;
    color = vec3(quantize(c.r, t, true), quantize(c.g, t, true), quantize(c.b, t, true));
  } else {
    color = colorize(quantize(toneOf(c), t, !toneIsRamp()), c);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

export const dither: EffectDef = {
  id: "dither",
  label: "Dither",
  grid: {
    cell: (p) => [p.size as number, p.size as number],
    fragment: CELL_FRAGMENT,
  },
  textures: [
    {
      uniform: "u_noise",
      key: () => "blue-noise",
      build: () => ({
        source: { data: blueNoiseBytes(), width: BLUE_NOISE_SIZE, height: BLUE_NOISE_SIZE },
        filter: "nearest",
        wrap: "repeat",
      }),
    },
  ],
  params: [
    {
      key: "pattern",
      label: "Pattern",
      type: "enum",
      options: [
        { value: "bayer2", label: "Bayer 2x2" },
        { value: "bayer4", label: "Bayer 4x4" },
        { value: "bayer8", label: "Bayer 8x8" },
        { value: "blueNoise", label: "Blue noise" },
      ],
      default: "bayer4",
    },
    // Dither cell in reference pixels (px at 1080p). At 4K each cell is twice
    // that, always an even number of pixels, which keeps colored cells
    // aligned with the 2x2 chroma blocks of 4:2:0 video.
    { key: "size", label: "Size", min: 1, max: 16, step: 1, default: 4 },
    // Output levels per channel (source) or along the tone scale. In palette
    // mode, levels = number of palette stops outputs exactly those colors.
    { key: "levels", label: "Levels", min: 2, max: 8, step: 1, default: 2 },
    { key: "bias", label: "Bias", min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: "linear", label: "Linear light", type: "bool", default: false },
    // Pattern jumps per second. 0 = static. Capped at 12: noise that changes
    // every frame at 4K roughly doubles the bitrate a video encoder needs.
    { key: "shimmer", label: "Shimmer", min: 0, max: 12, step: 1, default: 0 },
    ...colorModeParams({ mode: "source" }),
  ],
  randomParams(rand) {
    const patterns = ["bayer2", "bayer4", "bayer8", "blueNoise"];
    const modes = ["source", "duotone", "palette"];
    return {
      pattern: patterns[Math.floor(rand() * patterns.length)],
      size: Math.round(2 + rand() * 6),
      levels: Math.round(2 + rand() * 3),
      bias: 0,
      linear: false,
      shimmer: 0,
      colorMode: modes[Math.floor(rand() * modes.length)],
      ink: "#111111",
      paper: "#f4f1ea",
      invert: false,
    };
  },
};
