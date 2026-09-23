// "Ripple" look: op-art stripes in the Bridget Riley line. Parallel bands
// of flat colour whose edges ride slow travelling waves, so a flat sheet
// reads as folded and moving; a second, slower wave fattens and thins
// alternate bands, the tonal swell of Riley's "Cataract". The only look
// where the structure repeats and the colour cycles.
//
// SPEC
//
// 1. ONE PHASE FIELD. phi(p) = dot(p, N) * density + W(p), with N the stripe
//    normal and W a warp of three seeded plane waves,
//        W = warp * sum_j a_j sin(dot(p, D_j) k_j + loopAngle(w_j) + phase_j),
//    a = (1, 0.5, 0.25). Band b = floor(phi), position in band f = fract(phi).
//    Everything is analytic, so grad phi is exact and the band edges get a
//    true one-pixel blend at any resolution (point 4).
//
// 2. WIDTH SWELL. phi' = phi - delta(p) cos(pi phi). At an integer phi the
//    cosine is +-1, alternating, so consecutive band edges move in opposite
//    directions: even bands widen where odd bands narrow, by a slow spatial
//    wave delta(p) = 0.28 swell sin(...). |delta| < 1/pi keeps phi'
//    monotonic, so bands never fold over. d phi'/d phi = 1 + pi delta
//    sin(pi phi) is exact and feeds the AA.
//
// 3. COLOUR CYCLES WITHOUT A SEAM. Band b takes t = tri(b / (L - 1)), a
//    triangle wave with period 2(L - 1) bands: the ramp is walked forward
//    through its L stops, then backward, so the last stop meets itself and
//    the first meets itself. No band ever jumps from the last stop to the
//    first. L is u_bands, independent of the palette size (like strata's
//    layers): with L = 2 the stripes alternate the ramp's two ends.
//
// 4. AA. aa = |grad phi'| * pixel * 1.2; the band colour blends into the
//    next band's over the last aa of f.
//
// 5. MOTION. The three warp waves and the swell wave all travel through
//    loopAngle, so the bands undulate forever and every cycle is exact.
//    The bands themselves do not slide (a slide by one band is not a loop
//    of the colour cycle).
//
// Against its siblings: dune is crests seen side-on with soft bodies;
// ripple is flat bands, hard-edged, repeating, cyclic.

import type { ShaderDef } from "../types";
import { GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_bands;
uniform float u_density;
uniform float u_warp;
uniform float u_waves;
uniform float u_swell;
uniform float u_angle;
uniform float u_grain;

${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const float PI = 3.14159265;

float tri(float x) {
  return 1.0 - abs(1.0 - 2.0 * fract(0.5 * x));
}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();

  float ang = u_angle * PI / 180.0;
  vec2 N = vec2(-sin(ang), cos(ang));

  float phi = dot(p, N) * u_density;
  vec2 grad = N * u_density;

  // Three warp waves. Directions seeded, within 60 degrees of the stripe
  // normal, so they bend the bands rather than shear along them.
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float a = fj < 0.5 ? 1.0 : (fj < 1.5 ? 0.5 : 0.25);
    float k = u_waves * (fj < 0.5 ? 1.3 : (fj < 1.5 ? 2.4 : 4.0));
    float w = fj < 0.5 ? 0.25 : (fj < 1.5 ? 0.4 : 0.6);
    float da = ang + (seedHash(fj * 3.0 + 1.0) - 0.5) * 2.1;
    vec2 D = vec2(-sin(da), cos(da));
    float ph = dot(p, D) * k + loopAngle(w) * (seedHash(fj * 3.0 + 2.0) < 0.5 ? 1.0 : -1.0) + seedHash(fj * 3.0 + 3.0) * TAU;
    // Up to five bands of displacement at warp 1: the folds have to be far
    // bigger than a band for the sheet to read as a surface.
    float amp = u_warp * 5.0 * a;
    phi += amp * sin(ph);
    grad += amp * k * cos(ph) * D;
  }

  // Width swell: a slow wave along the bands.
  vec2 A = vec2(N.y, -N.x);
  float sw = 0.28 * u_swell * sin(dot(p, A) * 5.0 + dot(p, N) * 1.5 + loopAngle(0.15) + seedHash(17.0) * TAU);
  float phi2 = phi - sw * cos(PI * phi);
  float dphi = 1.0 + PI * sw * sin(PI * phi);

  float b = floor(phi2);
  float f = phi2 - b;

  float pixel = 2.0 * halfIso.y / u_resolution.y;
  float aa = clamp(length(grad) * abs(dphi) * pixel * 1.2, 0.001, 0.5);

  float L = max(floor(u_bands + 0.5), 2.0);
  float tHere = tri(b / (L - 1.0));
  float tNext = tri((b + 1.0) / (L - 1.0));
  vec3 color = mix(palette(tHere), palette(tNext), smoothstep(1.0 - aa, 1.0, f));

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const ripple: ShaderDef = {
  id: "ripple",
  label: "Ripple",
  fragment: FRAGMENT,
  params: [
    // Colours per cycle: the ramp is walked forward through this many stops
    // and back. Independent of the palette size.
    { key: "bands", label: "Bands", min: 2, max: 8, step: 1, default: 4 },
    // Stripes per frame height.
    { key: "density", label: "Density", min: 4, max: 30, step: 0.5, default: 12 },
    // How far the waves bend the bands.
    { key: "warp", label: "Warp", min: 0, max: 1, step: 0.01, default: 0.5 },
    // Wave frequency: low is one big fold, high is a shiver.
    { key: "waves", label: "Waves", min: 0.5, max: 2, step: 0.05, default: 1 },
    // Alternate bands fatten and thin in a slow wave.
    { key: "swell", label: "Swell", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "angle", label: "Angle", min: 0, max: 360, step: 1, default: 0 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.05 },
  ],
  randomParams(rand) {
    return {
      bands: Math.floor(2 + rand() * 7),
      density: 6 + rand() * (22 - 6),
      // Never flat: unwarped stripes are a ruler, not a ripple.
      warp: 0.25 + rand() * (1 - 0.25),
      waves: 0.6 + rand() * (1.8 - 0.6),
      swell: rand(),
      angle: Math.floor(rand() * 360),
      grain: 0.05,
    };
  },
};
