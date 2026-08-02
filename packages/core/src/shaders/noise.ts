// Shared GLSL chunks for InstantShader's shader looks. Every look pulls its
// noise primitives from here instead of hand-rolling its own hash/simplex
// function, so all looks share one noise "fingerprint" and bugs only need
// fixing in one place.
//
// Not every look uses every chunk: SIMPLEX_2D and GRAIN are shared by both
// flow and beam, but FBM and SHAPE are down to flow alone -- beam was
// reworked onto a single smooth snoise octave, because summed octaves are
// exactly what gave it the fine filament detail that rework existed to
// remove.
//
// IMPORTANT float-precision note: snoise's internal floor() can't tell
// adjacent pixels apart once its input magnitude climbs past roughly
// +-1000 (float32 mantissa runs out of bits at that range) -- the noise
// field goes flat in large dead zones. u_time and u_seed already arrive
// pre-modded into small ranges (see core/renderer.ts), but any shader that
// scales or offsets them further before feeding snoise/fbm2/fbm3 must keep
// the result small too.

/**
 * 2D simplex noise, copied VERBATIM from the standard reference
 * implementation (Ashima Arts / Ian McEwan, public domain). Do not hand-edit
 * the constants below -- they are fitted values for the simplex lattice
 * skew/unskew and permutation polynomial, not numbers you can derive or
 * "clean up".
 */
export const SIMPLEX_2D = `
vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289_3(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

/**
 * Fractal Brownian motion: sums octaves of snoise at doubling frequency
 * (lacunarity 2.0) and halving amplitude (gain 0.5), so each added octave
 * layers in finer detail at proportionally less visual weight. This is
 * what turns a single flat simplex "blob" field into the layered, natural
 * texture readers associate with clouds, drifting currents, or silk. Both
 * variants divide by the total amplitude used so their output stays in
 * roughly [-1, 1] no matter how many octaves are summed -- callers can mix
 * fbm2/fbm3 output the same way they'd mix a raw snoise() call.
 *
 * fbm2 (2 octaves) is cheap and reads as a soft, single-scale warp -- good
 * for silky/large-scale distortion. fbm3 (3 octaves) adds one more, finer
 * top layer for looks that want visible internal detail, at the cost of one
 * extra snoise() evaluation per sample.
 */
export const FBM = `
float fbm2(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;  // gain: each octave contributes half the previous one's weight
  float freq = 1.0; // lacunarity: each octave doubles sampling frequency
  sum += snoise(p * freq) * amp; amp *= 0.5; freq *= 2.0;
  sum += snoise(p * freq) * amp;
  return sum / 0.75; // normalize by total amplitude (0.5 + 0.25)
}

float fbm3(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  sum += snoise(p * freq) * amp; amp *= 0.5; freq *= 2.0;
  sum += snoise(p * freq) * amp; amp *= 0.5; freq *= 2.0;
  sum += snoise(p * freq) * amp;
  return sum / 0.875; // normalize by total amplitude (0.5 + 0.25 + 0.125)
}
`;

/**
 * Distribution shaping for palette lookups.
 *
 * `spread(x, sd)` maps a raw fbm value onto [0,1] with an approximately
 * UNIFORM distribution, so every palette stop gets its fair share of screen
 * area. It exists because the obvious remap, `x * 0.5 + 0.5`, does not:
 * summed simplex octaves are roughly Gaussian (fbm2 sd ~0.35, fbm3 sd ~0.31,
 * 90% of samples inside +-0.5), so a linear remap parks ~90% of the image in
 * the middle half of the ramp and the outer stops barely appear. Measured on
 * the linear version: 0-2% of frame for the outer stops of an 8-color bank.
 *
 * The right transform for that is the Gaussian CDF. `sd` is the standard
 * deviation of the fbm being passed in (0.35 for fbm2, 0.31 for fbm3), and
 * the algebraic sigmoid below approximates Phi(x/sd) closely out to about
 * 2 sd. Two things it is deliberately NOT:
 *
 * - not a wide linear gain, which would reach the ramp ends but clip its
 *   tails into flat posterized patches of the end colors;
 * - not a steeper sigmoid. An earlier version normalized so that |x| = 0.8
 *   hit the ramp end exactly, on the theory that the outermost stop should
 *   be reachable. But fbm has real mass well before 0.8, so that version
 *   hard-clamped ~8% of the frame onto EACH end color, and the interior
 *   stops of the 8-color banks collapsed to 3-4% of frame apiece. Reaching
 *   the end color matters much less than not drowning everything else.
 *
 * The residual 1/0.96 stretch is because the algebraic sigmoid has fatter
 * tails than a true Gaussian and would otherwise stop ~4% short of the ramp
 * ends. The clamp is effectively unreachable for real fbm input (it needs
 * |x| > 1.28 at sd 0.35) and is there as a guard, not as a shaping step.
 */
export const SHAPE = `
float spread(float x, float sd) {
  float k = 1.07 * sd; // fitted at the 1-sigma point so s(sd) ~= Phi(1)
  float s = x / sqrt(x * x + k * k);
  return clamp(0.5 + 0.5 * s / 0.96, 0.0, 1.0);
}
`;

/**
 * Cheap per-pixel hash noise for film grain -- deliberately NOT simplex
 * based. Grain needs to look like uncorrelated static at the pixel level;
 * a band-limited noise function like snoise would need an impractically
 * huge input scale to look that fine-grained, which would push it right
 * back into the float-precision dead zone described above. Matches the same
 * hash-based grain technique used for this purpose in the InstantGradient
 * app (origin repo). `time` is folded into the hash input (not just added
 * as a phase) so the grain pattern itself re-randomizes every frame instead
 * of sitting static on top of a moving gradient.
 */
export const GRAIN = `
float grain(vec2 uv, float time) {
  vec2 st = uv * 200.0 + time * 0.1; // 200x: grain must read as per-pixel static, not a soft blob
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}
`;
