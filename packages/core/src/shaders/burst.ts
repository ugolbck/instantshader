// "Burst" look: prismatic rays. A dark core somewhere in the frame and
// hundreds of thin rays radiating from it, each its own colour, grainy,
// brightening outward and slowly turning.
//
// SPEC
//
// 1. RAYS ARE ANISOTROPIC NOISE IN LOG-POLAR SPACE. About the centre,
//    (theta, rho = log r). Periodic Perlin noise sampled at A = 40 angular
//    periods and 0.6 per unit of rho has features ~60x longer radially than
//    they are wide: rays. The integral period makes the field continuous
//    across atan's branch cut (halo's trick). Two octaves; the ray mask is
//    the field pushed through a smoothstep whose width is u_rays.
//
// 2. A DARK CORE, LIT TO THE CORNERS. env = (1 - exp(-(r/core)^2)) * exp(-0.3 r):
//    black at the centre, full a core-radius out, and only gently dimmer at
//    the frame edge, so the composition is a hole in a field of light
//    rather than a glow on black.
//
// 3. PALETTE BY AZIMUTH, PER RAY. t = 0.5 + 0.5 cos(theta - theta0 + 2 rays):
//    the ramp wraps around the burst without a seam, and the ray field
//    inside the cosine scatters neighbouring rays to neighbouring stops.
//
// 4. NOT EMISSIVE. color = palette(t) * (0.15 + 0.85 * mask * env): a ray
//    at full mask and envelope IS its stop at full saturation, and the
//    core is the stop crushed to 15%. Grain is part of the look and
//    defaults high.
//
// 5. MOTION. theta0 turns by loopAngle; the ray field streams outward by
//    loopTravel along rho on a tiling axis; the core radius breathes on
//    loopFreq.
//
// Against its siblings: bloom is a fan of fat soft lobes lit at the
// centre; burst is thin rays lit at the rim; whorl spirals, burst does not.

import type { ShaderDef } from "../types";
import { PERIODIC_2D, GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_rays;
uniform float u_core;
uniform float u_x;
uniform float u_y;
uniform float u_spin;
uniform float u_grain;

${PERIODIC_2D}
${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const float A = 40.0;

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();

  vec2 c = vec2(u_x, u_y) * halfIso;
  vec2 rel = p - c;
  float r = max(length(rel), 0.0005);
  float theta = atan(rel.y, rel.x);

  // Two rotations: the colour wheel (theta0) and, slower, the ray field
  // (theta1). Both are whole turns per loop; the ray field must turn by a
  // whole number of turns, not a whole number of noise periods, or the
  // loop closes on a shifted copy of the rays. The static u_spin term gives
  // the knob a visible effect at t = 0.
  float theta0 = loopAngle(0.06 * u_spin + 0.001) + seedHash(2.0) * TAU + 0.7 * u_spin;
  // loopAngle floors at one turn per loop, and one turn of a 40-ray field
  // in under 12 s is a strobe; below that the ray field holds still and
  // only streams outward (loopFreq's freeze, by hand).
  float rayTurn = (u_loop > 0.0 && u_loop < 12.0) ? 0.0 : loopAngle(0.02 * u_spin + 0.001);
  float theta1 = rayTurn + seedHash(3.0) * TAU;
  // Radial travel on a tiling axis: rho scaled so the tile is integral.
  float rho = log(r / 0.1) * 0.6;
  float flowOut = loopTravel(0.05, vec2(0.0, 1.0), 4.0).y;
  vec2 so = seedOffset();

  vec2 sp = vec2((theta - theta1) / TAU * A, rho - flowOut + so.x);
  float rays = pnoise(sp, vec2(A, 4.0)) + 0.5 * pnoise(sp * 2.0 + vec2(0.0, so.y), vec2(2.0 * A, 8.0));
  // Sector field: a few broad angular sectors that keep neighbouring rays
  // in one family, and the mask's contrast.
  float sector = pnoise(vec2((theta - theta1) / TAU * 6.0, so.y * 0.1), vec2(6.0, 1024.0));
  // Softer toward the centre, where the rays converge: the reference's
  // rays blur into the core rather than sharpening to a point.
  float edge = mix(0.7, 0.25, u_rays) + 0.5 * exp(-r / 0.3);
  float mask = smoothstep(-edge, edge, rays + 0.3 * sector);

  float core = 0.25 * u_core * (1.0 + 0.12 * sin(loopFreq(0.1) * u_time + u_seed));
  float env = (1.0 - exp(-(r * r) / (core * core))) * exp(-0.3 * r);

  float t = 0.5 + 0.5 * cos(theta - theta0 + 2.0 * rays + 1.5 * sector);
  vec3 color = palette(t) * (0.15 + 0.85 * mask * env);

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const burst: ShaderDef = {
  id: "burst",
  label: "Burst",
  fragment: FRAGMENT,
  params: [
    // Ray contrast: 0 is soft sectors, 1 is hard thin rays.
    { key: "rays", label: "Rays", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Radius of the dark core.
    { key: "core", label: "Core", min: 0.2, max: 2, step: 0.01, default: 1 },
    { key: "x", label: "X", min: -1, max: 1, step: 0.01, default: 0.1 },
    { key: "y", label: "Y", min: -1, max: 1, step: 0.01, default: 0.05 },
    // Rotation rate of the whole burst.
    { key: "spin", label: "Spin", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.14 },
  ],
  randomParams(rand) {
    return {
      rays: 0.3 + rand() * (1 - 0.3),
      core: 0.5 + rand() * (1.6 - 0.5),
      x: -0.7 + rand() * 1.4,
      y: -0.7 + rand() * 1.4,
      spin: 0.2 + rand() * 0.8,
      grain: 0.14,
    };
  },
};
