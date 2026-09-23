// "Silk" look: a sheet of satin, lit from one side. Long folds run across the
// frame, each one catching a soft highlight along its crest, and the colour
// lives in the cloth itself: the palette is printed on the fabric and the
// light only reveals its relief.
//
// SPEC
//
// 1. A HEIGHT FIELD OF FOLDS. h(p) is 2-octave simplex fbm sampled
//    anisotropically: the frame is rotated onto a seeded fold axis and
//    compressed along it by 1 + 4 * u_folds (strata's toField), so features
//    become long ridges instead of blobs. A single low-frequency warp term,
//    evaluated once and shared by every tap, bends the ridges so they
//    gather and split like real drapery rather than running parallel.
//
// 2. A NORMAL FROM CENTRAL DIFFERENCES WITH A FIXED STEP. WebGL1 has no
//    derivatives, so n comes from four extra height taps at +-eps in FRAME
//    units (not pixels): the preview and a 4K export must shade the same
//    surface, and a step tied to the pixel would make the export's folds
//    sharper than the preview's.
//
// 3. TWO LIGHTING TERMS, NEITHER OF THEM WHITE-HEAVY. Wrap diffuse
//    (0.5 + 0.5 n.L) multiplies the fabric colour, so shadow sides darken
//    without greying; the sheen is Kajiya-Kay's anisotropic highlight,
//    sqrt(1 - (T.H)^2)^k with T the thread direction (the fold axis), so it
//    streaks ALONG the folds the way satin does, in two lobes: a tight one
//    and a wide soft one. The sheen colour is the fabric's own colour pulled
//    halfway toward white, so bright banks stay coloured and dark banks get a
//    real gleam.
//
// 4. PALETTE ON THE CLOTH. t = spread(fbm2) of a second, coarser field that
//    drifts independently, so colour boundaries cross the folds instead of
//    following them. Every stop is present with the usual equal-area
//    guarantee; the shading modulates it by at most a factor of ~2.
//
// 5. MOTION. The fold field and the colour field drift on loopDrift paths
//    at different rates, and the light's azimuth sways +-8 degrees on a
//    loopFreq sinusoid, so the highlights migrate across the folds even
//    when the folds themselves barely move.
//
// Against its siblings: strata is relief seen from above as hard steps;
// silk is the same idea made continuous and lit as a material.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, FBM, SHAPE, GRAIN, ISO, SEED } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_folds;
uniform float u_depth;
uniform float u_warp;
uniform float u_sheen;
uniform float u_light;
uniform float u_grain;

${SIMPLEX_2D}
${FBM}
${SHAPE}
${GRAIN}
${ISO}
${SEED}

const float PI = 3.14159265;

vec2 toField(vec2 v, vec2 axis) {
  return vec2(dot(v, axis) / (1.0 + 4.0 * u_folds), dot(v, vec2(-axis.y, axis.x)));
}

// Fold height at frame point p. The warp is passed in, computed once at the
// pixel: it varies over ~2 frame units, the taps are 0.006 apart.
float height(vec2 p, vec2 axis, float freq, vec2 so, vec2 drift, float warp) {
  vec2 q = toField(p, axis) * freq + so + drift;
  q.y += warp;
  return fbm2(q);
}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);

  vec2 so = seedOffset();
  float axisAngle = seedHash(3.0) * PI;
  vec2 axis = vec2(cos(axisAngle), sin(axisAngle));
  float freq = 1.6 * u_scale;

  vec2 drift = loopDrift(0.025, vec2(1.0, 0.0));
  // Warp: one coarse octave, shifts the across-fold coordinate so ridges
  // bend, converge and fork.
  float warp = u_warp * 1.4 * snoise(toField(p, axis) * (0.45 * freq) + so.yx + 31.0 + drift.yx);

  float eps = 0.006;
  float hx1 = height(p + vec2(eps, 0.0), axis, freq, so, drift, warp);
  float hx0 = height(p - vec2(eps, 0.0), axis, freq, so, drift, warp);
  float hy1 = height(p + vec2(0.0, eps), axis, freq, so, drift, warp);
  float hy0 = height(p - vec2(0.0, eps), axis, freq, so, drift, warp);
  float h = 0.25 * (hx1 + hx0 + hy1 + hy0);

  // Slope scale: fbm2 spans ~[-1, 1] over ~1/freq frame units, so its raw
  // gradient is O(freq); 0.35 * depth brings the default to slopes near 1.
  float amp = 0.35 * u_depth / eps;
  vec3 n = normalize(vec3(-(hx1 - hx0) * amp * 0.5, -(hy1 - hy0) * amp * 0.5, 1.0));

  // Light: azimuth measured from the ACROSS-fold direction, so u_light = 0
  // always rakes across the folds whatever axis the seed picked (a light
  // along the folds shows no relief at all). Slow sway; elevation 40.
  float az = axisAngle + 0.5 * PI + u_light * PI / 180.0 + 0.14 * sin(loopFreq(0.12) * u_time + u_seed);
  vec3 L = vec3(cos(az) * 0.766, sin(az) * 0.766, 0.643);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  vec3 T = normalize(vec3(axis, 0.0) - n * dot(vec3(axis, 0.0), n));

  float ndl = dot(n, L);
  float diff = 0.5 + 0.5 * ndl;
  float th = sqrt(max(1.0 - dot(T, H) * dot(T, H), 0.0));
  float sheen = (0.55 * pow(th, 48.0) + 0.3 * pow(th, 7.0)) * max(ndl, 0.0);
  // Valleys sit in shadow from the folds above them.
  float cav = 0.75 + 0.25 * (0.5 + 0.5 * h);

  // Colour: its own coarse field, drifting on its own path.
  vec2 drift2 = loopDrift(0.02, vec2(0.0, 1.0));
  float t = spread(fbm2(p * (0.55 * u_scale) + so + 17.0 + drift2), 0.35);
  vec3 cloth = palette(t);

  vec3 color = cloth * (0.35 + 0.65 * diff) * cav;
  color += mix(cloth, vec3(1.0), 0.5) * sheen * u_sheen;

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const silk: ShaderDef = {
  id: "silk",
  label: "Silk",
  fragment: FRAGMENT,
  params: [
    { key: "scale", label: "Scale", min: 0.5, max: 2.5, step: 0.05, default: 1 },
    // Anisotropy: 0 is rumpled cloth, 1 is long parallel drapery.
    { key: "folds", label: "Folds", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Relief height: how steep the folds shade.
    { key: "depth", label: "Depth", min: 0.2, max: 2, step: 0.01, default: 1 },
    // Bends the folds so they gather and fork.
    { key: "warp", label: "Warp", min: 0, max: 1, step: 0.01, default: 0.5 },
    // Satin highlight strength.
    { key: "sheen", label: "Sheen", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Light azimuth, relative to the across-fold direction: 0 and 180 rake
    // across the folds, 90 and 270 skim along them and flatten the relief.
    { key: "light", label: "Light", min: 0, max: 360, step: 1, default: 20 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  ],
  randomParams(rand) {
    return {
      scale: 0.7 + rand() * (1.8 - 0.7),
      folds: 0.3 + rand() * (1 - 0.3),
      depth: 0.6 + rand() * (1.6 - 0.6),
      warp: rand(),
      sheen: 0.3 + rand() * (0.9 - 0.3),
      // Kept within 50 degrees of raking, either side.
      light: Math.floor((rand() < 0.5 ? 0 : 180) + (rand() - 0.5) * 100 + 360) % 360,
      grain: 0.06,
    };
  },
};
