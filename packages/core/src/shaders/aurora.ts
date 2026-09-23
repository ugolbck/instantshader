// "Aurora" look: northern lights. One to three curtains hang in a dark sky,
// each a wavy lower edge with light climbing from it and fading out, torn
// into vertical rays. The palette flows along the curtain and climbs with
// altitude, so a two-colour bank reads as one curtain changing hue and an
// eight-colour bank as a whole sky of them.
//
// SPEC
//
// 1. A CURTAIN IS AN EDGE PLUS A FALLOFF. In a frame rotated by u_angle so
//    that "up" is +y, curtain j has a lower edge y_j(x) = b_j + waves, and
//    every pixel's altitude above it is d = (y - y_j(x)) / height. Radiance
//    is a hot fringe over a fade, exp(-1.3 d) + 0.5 exp(-6 |d|), cut off
//    below the edge over a short ramp: the profile of a real curtain seen
//    from below. The rays (point 3) push the cut-off up and down per
//    column, so the lower border is ragged, not a hill line.
//
// 2. THE EDGE IS TWO OCTAVES OF TILING NOISE, TRAVELLING SIDEWAYS. pnoise
//    with an integral period along x, walked by loopTravel over exactly one
//    period per loop, so the curtain drifts in a straight line forever and
//    still loops. A simplex edge could only loop by swaying back and forth.
//
// 3. RAYS ARE ANISOTROPIC NOISE. A second tiling field sampled at 24x the
//    frequency across the curtain and 1.5x along its altitude has iso-lines
//    that run straight up, so env * ray shatters the curtain into vertical
//    columns of light. The rays field travels on its own period, faster,
//    so the columns flicker across the drifting edge.
//
// 4. PALETTE ALONG THE CURTAIN, LIFTED BY ALTITUDE. t = 0.7 sweep(x) + 0.5 d,
//    where sweep is a slow cosine of x that turns through loopAngle. Along
//    the fringe the ramp's whole lower three quarters pass at full
//    brightness; each column then climbs toward the last stop as it fades.
//    The ray field nudges t so colour boundaries feather along the rays.
//
// 5. EMISSIVE. Beam's compositing: the sky is the ramp's darkest stop
//    crushed toward black, the curtains are ADDED with the luma gain and
//    chroma boost, and a dark-gated white lift keeps a near-black first stop
//    visible at the fringe.
//
// Against its siblings: beam is one solid streak; aurora is diffuse light
// with a structure, edge and rays, and the only look lit from a lower edge.

import type { ShaderDef } from "../types";
import { PERIODIC_2D, GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_curtains;
uniform float u_height;
uniform float u_waves;
uniform float u_rays;
uniform float u_glow;
uniform float u_angle;
uniform float u_grain;

${PERIODIC_2D}
${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const float PI = 3.14159265;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const int MAX_CURTAINS = 3;

void main() {
  vec2 uv = worldUv();
  vec2 p0 = isoCoord(uv);
  vec2 halfIso = isoHalf();

  float ang = u_angle * PI / 180.0;
  vec2 p = vec2(p0.x * cos(ang) + p0.y * sin(ang), -p0.x * sin(ang) + p0.y * cos(ang));
  float x = p.x;
  float y = p.y;

  // Edge field: period 4 in noise units at 1.3 per frame unit, walked one
  // period per loop. Rays: period 48 at 24 per frame unit, i.e. 2 frame
  // units, walked one period per loop at a higher unlooped rate.
  float trE = loopTravel(0.03, vec2(1.0, 0.0), 4.0 / 1.3).x;
  float trR = loopTravel(0.06, vec2(1.0, 0.0), 2.0).x;
  float pulse = loopFreq(0.2) * u_time;

  // ---- background: the ramp's darkest stop, crushed (as in beam) ----------
  vec3 cA = palette(0.0);
  vec3 cB = palette(0.5);
  vec3 cC = palette(1.0);
  float lA = dot(cA, LUMA);
  float lB = dot(cB, LUMA);
  float lC = dot(cC, LUMA);
  vec3 dk = mix(cA, cB, step(lB, lA));
  dk = mix(dk, cC, step(lC, min(lA, lB)));
  vec3 color = dk * 0.1;

  float n = floor(u_curtains + 0.5);
  for (int j = 0; j < MAX_CURTAINS; j++) {
    float fj = float(j);
    if (fj >= n) break;
    float s1 = seedHash(fj * 4.0 + 1.0);
    float s2 = seedHash(fj * 4.0 + 2.0);
    float s3 = seedHash(fj * 4.0 + 3.0);

    // Edges spaced up the frame; a single curtain sits low.
    float base = mix(-0.34, 0.1, fj / 2.0) + 0.2 * (s1 - 0.5);
    float height = u_height * (0.75 + 0.5 * s2);
    float row = 7.0 + fj * 3.0 + seedHash(fj + 9.0) * 50.0;
    float ex = (x + trE) * 1.3;
    float wave = pnoise(vec2(ex, row), vec2(4.0, 1024.0))
               + 0.5 * pnoise(vec2(ex * 2.0 + 5.0, row + 1.5), vec2(8.0, 1024.0))
               + 0.25 * pnoise(vec2(ex * 4.0 + 11.0, row + 3.5), vec2(16.0, 1024.0));
    float edge = base + 0.16 * u_waves * wave;

    float d = (y - edge) / height;

    // Rays: two octaves (period 2 frame units for both, so one loopTravel
    // serves both), squared so the columns are thin and the gaps wide.
    float rx = (x + trR) + s2 * 3.0;
    float rn = 0.65 * pnoise(vec2(rx * 24.0, d * 1.5 + s3 * 9.0), vec2(48.0, 1024.0))
             + 0.35 * pnoise(vec2(rx * 9.0 + 3.0, d * 0.7 + s3 * 4.0), vec2(18.0, 1024.0));
    float ray = 0.5 + 0.5 * rn;
    ray = ray * ray;

    // Each ray hangs a little lower or higher than the edge, so the fringe
    // is ragged rather than a cut-out hill line.
    d += 0.3 * u_rays * (0.5 - ray);
    // Hot fringe over a fast fade.
    float env = smoothstep(-0.18, 0.05, d) * (exp(-1.3 * max(d, 0.0)) + 0.5 * exp(-6.0 * abs(d)));
    env *= mix(1.0, 0.25 + 1.5 * ray, u_rays);
    env *= 1.0 + 0.1 * sin(pulse + 2.0 * x + fj * 2.1 + u_seed);

    // Ramp: a slow sweep ALONG the curtain (a cosine of x, one period per
    // ~3 frame widths, turning through loopAngle), lifted by altitude. Along
    // the fringe every stop appears at full brightness somewhere; going up,
    // each column climbs toward the last stop as it fades. Ramp purely by
    // altitude was tried first: the upper stops only ever showed dim, and a
    // dim warm stop is brown.
    float sweep = 0.5 + 0.5 * cos(x * 2.2 + seedHash(fj + 21.0) * TAU + loopAngle(0.05) * (fj < 0.5 ? 1.0 : -1.0));
    float t = clamp(0.7 * sweep + 0.5 * max(d, 0.0) + 0.1 * u_rays * (ray - 0.5), 0.0, 1.0);
    vec3 col = palette(t);
    float lum = dot(col, LUMA);
    float gain = 1.0 / (1.0 + 1.2 * lum * lum);
    float boost = 1.0 + 2.0 * (1.0 - lum) * (1.0 - lum) * (1.0 - lum);

    float weight = (0.6 + 0.9 * u_glow) * mix(0.6, 1.0, fj / max(n - 1.0, 1.0));
    color += col * env * gain * boost * weight;
    color += vec3((1.0 - lum) * (1.0 - lum) * env * 0.15 * weight);
  }

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const aurora: ShaderDef = {
  id: "aurora",
  label: "Aurora",
  fragment: FRAGMENT,
  params: [
    { key: "curtains", label: "Curtains", min: 1, max: 3, step: 1, default: 2 },
    // How far the light climbs above the edge, in frame heights.
    { key: "height", label: "Height", min: 0.15, max: 1, step: 0.01, default: 0.45 },
    // Edge waviness: 0 is a level horizon, 1 a folded curtain.
    { key: "waves", label: "Waves", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Vertical striation: 0 is a smooth glow, 1 distinct rays.
    { key: "rays", label: "Rays", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, default: 0.5 },
    // Rotation of the whole sky. 0 hangs the curtains upright.
    { key: "angle", label: "Angle", min: 0, max: 360, step: 1, default: 0 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    return {
      curtains: Math.floor(1 + rand() * 3),
      height: 0.3 + rand() * (0.8 - 0.3),
      waves: 0.3 + rand() * (1 - 0.3),
      rays: 0.3 + rand() * (0.9 - 0.3),
      glow: 0.3 + rand() * (0.9 - 0.3),
      // Mostly upright, with the odd tilt.
      angle: Math.floor((rand() < 0.7 ? -15 + rand() * 30 : rand() * 360) + 360) % 360,
      grain: 0.08,
    };
  },
};
