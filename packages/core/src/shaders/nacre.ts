// "Nacre" look: iridescent liquid. Soft glassy folds seen from above, and
// on every slope the colour walks through the neighbouring stops and back,
// the way mother of pearl or a soap film shifts with the viewing angle.
// The shift only ever visits the palette's own colours, which is what
// keeps it inside the user's colour world.
//
// SPEC
//
// 1. A LIQUID HEIGHT FIELD. One smooth simplex octave (plus a faint
//    second) over a domain warped once, isotropic and large, so the surface
//    is a few pooled lobes; narrow ridges along two contours of that same
//    field add thin fold lines that hug the lobes (u_crease). Contours of
//    one field never cross, so no fold line cuts through another. Normal by
//    central differences with a fixed frame-unit step (see silk).
//
// 2. IRIDESCENCE IS A RAMP SHIFT BY TILT. Thin-film colour is a function of
//    the angle light travels through the film; the stand-in here is the
//    normal's tilt, 1 - n.z in [0, 1]. The ramp coordinate is a slow base
//    field plus u_iridescence * 1.5 * tilt, folded by a triangle wave so it
//    can never jump: flat areas show the base colour, slopes walk up the
//    ramp and back down. Two-colour banks give a quiet two-tone film;
//    eight-colour banks a full holographic sheet.
//
// 3. LIGHT-HANDED SHADING. Soft wrap diffuse (0.7 + 0.3 n.L) and a thin
//    white rim on the steepest slopes (tilt^6), the glassy ridge line of a
//    liquid surface. No cavity darkening: the reference is bright to the
//    corners.
//
// 4. MOTION. The surface and the base colour drift on loopDrift paths; the
//    light azimuth sways on loopFreq.
//
// Against its siblings: silk is cloth with a fixed print and a sheen;
// nacre is a film whose colour is a function of its slope.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, FBM, SHAPE, GRAIN, ISO, SEED } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_flow;
uniform float u_crease;
uniform float u_depth;
uniform float u_iridescence;
uniform float u_light;
uniform float u_grain;

${SIMPLEX_2D}
${FBM}
${SHAPE}
${GRAIN}
${ISO}
${SEED}

const float PI = 3.14159265;

float tri(float x) {
  return 1.0 - abs(1.0 - 2.0 * fract(0.5 * x));
}

// One smooth octave with a faint second: pooled lobes, not texture. The
// creases are narrow ridges where the base field crosses a level, so they
// are contours of the lobes themselves: they hug each lobe's edge and, as
// level sets of one field, never cross each other or cut through a lobe.
float height(vec2 p, float f, vec2 so, vec2 drift, vec2 warp) {
  vec2 q = (p + warp) * f + so + drift;
  float base = snoise(q) + 0.18 * snoise(q * 2.1 + 5.0);
  float d0 = base;
  float d1 = abs(base) - 0.6;
  float crease = exp(-(d0 * d0) / 0.012) + 0.6 * exp(-(d1 * d1) / 0.01);
  return base * 0.7 + crease * u_crease * 0.3;
}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);

  vec2 so = seedOffset();
  float f = 0.55 * u_scale;
  vec2 drift = loopDrift(0.02, vec2(1.0, 0.0));

  // One warp for every tap: it varies over ~2 frame units, the taps are
  // 0.006 apart.
  vec2 wq = p * (0.45 * f) + so.yx + 23.0 + drift.yx;
  vec2 warp = u_flow * 0.5 * vec2(snoise(wq), snoise(wq + vec2(9.2, 4.1)));

  float eps = 0.006;
  float hx1 = height(p + vec2(eps, 0.0), f, so, drift, warp);
  float hx0 = height(p - vec2(eps, 0.0), f, so, drift, warp);
  float hy1 = height(p + vec2(0.0, eps), f, so, drift, warp);
  float hy0 = height(p - vec2(0.0, eps), f, so, drift, warp);

  float amp = 0.5 * u_depth / eps;
  vec3 n = normalize(vec3(-(hx1 - hx0) * amp * 0.5, -(hy1 - hy0) * amp * 0.5, 1.0));
  float tilt = 1.0 - n.z;

  float az = u_light * PI / 180.0 + 0.12 * sin(loopFreq(0.1) * u_time + u_seed);
  vec3 L = vec3(cos(az) * 0.643, sin(az) * 0.643, 0.766);
  float diff = 0.7 + 0.3 * dot(n, L);
  float rim = pow(tilt, 6.0) * 0.35;

  vec2 drift2 = loopDrift(0.015, vec2(0.0, 1.0));
  float t0 = spread(fbm2(p * (0.4 * f) + so + 17.0 + drift2), 0.35);
  float t = tri(t0 + u_iridescence * 1.5 * tilt);
  vec3 color = palette(t) * diff + vec3(rim);

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const nacre: ShaderDef = {
  id: "nacre",
  label: "Nacre",
  fragment: FRAGMENT,
  params: [
    { key: "scale", label: "Scale", min: 0.4, max: 2, step: 0.05, default: 0.9 },
    // Domain warp: 0 is round pools, 1 is pulled liquid.
    { key: "flow", label: "Flow", min: 0, max: 1, step: 0.01, default: 0.5 },
    // Thin sharp fold lines between the lobes.
    { key: "crease", label: "Crease", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Relief height: how steep the slopes get, and so how far the colour
    // shifts on them.
    { key: "depth", label: "Depth", min: 0.2, max: 2, step: 0.01, default: 1 },
    // How far along the ramp a slope walks. 0 is a plain lit gradient.
    { key: "iridescence", label: "Iridescence", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "light", label: "Light", min: 0, max: 360, step: 1, default: 40 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.04 },
  ],
  randomParams(rand) {
    return {
      scale: 0.5 + rand() * (1.6 - 0.5),
      flow: rand(),
      crease: 0.2 + rand() * 0.8,
      depth: 0.6 + rand() * (1.6 - 0.6),
      // Never 0: without the shift this is a lit fbm, not nacre.
      iridescence: 0.3 + rand() * (1 - 0.3),
      light: Math.floor(rand() * 360),
      grain: 0.04,
    };
  },
};
