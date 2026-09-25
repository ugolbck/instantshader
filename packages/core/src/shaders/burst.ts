// "Burst" look: prismatic rays. A point somewhere in the frame and thin
// rays radiating from it, each its own colour, grainy, streaming outward
// in packets, optionally twisted into a pinwheel.
//
// SPEC
//
// 1. RAYS ARE ANISOTROPIC NOISE IN LOG-POLAR SPACE. About the centre,
//    (theta, rho = log r). Periodic Perlin noise sampled at A angular
//    periods (u_rays: 8 to 80) and 0.6 per unit of rho has features far
//    longer radially than they are wide: rays. The integral period makes
//    the field continuous across atan's branch cut (halo's trick). Two
//    octaves; the ray mask is the field pushed through a smoothstep whose
//    width is u_sharp. A third, shorter field streams outward faster: the
//    bright packets that travel along the rays.
//
// 2. TWIST. theta is offset by u_twist * rho, so every ray curves the same
//    way: a pinwheel at full twist, straight rays at none. A function of
//    rho only, so the angular period is intact.
//
// 3. CENTRE, FROM TUNNEL TO STAR. env = exp(-0.3 r) times a hole,
//    1 - exp(-(r/0.25)^2), faded out by u_glow; at full glow a white-hot
//    spot sits on the point the rays converge to. Rays soften toward the
//    centre either way.
//
// 4. PALETTE BY AZIMUTH, PER RAY. t = 0.5 + 0.5 cos(theta - theta0 + 2 rays):
//    the ramp wraps around the burst without a seam, and the ray field
//    inside the cosine scatters neighbouring rays to neighbouring stops.
//
// 5. NOT EMISSIVE. color = palette(t) * (0.15 + 0.85 * mask * env): a ray
//    at full mask and envelope IS its stop at full saturation. Grain is
//    part of the look and defaults high.
//
// 6. MOTION, WITHOUT ROTATION. The ray field and the packets stream
//    outward by loopTravel on tiling axes (exact for any loop length); the
//    colour wheel sways a few degrees on loopFreq. Nothing turns by whole
//    turns: a full turn of a 40-ray field per loop is a strobe, and a
//    loop-dependent turn makes the preview a different picture at every
//    loop length.
//
// Against its siblings: bloom is a fan of fat soft lobes; burst is thin
// rays; whorl is one thick spiral band, burst's twist is many thin ones.

import type { ShaderDef } from "../types";
import { PERIODIC_2D, GRAIN, ISO, SEED } from "./noise";

const FRAGMENT = `
uniform float u_rays;
uniform float u_sharp;
uniform float u_glow;
uniform float u_twist;
uniform float u_x;
uniform float u_y;
uniform float u_grain;

${PERIODIC_2D}
${GRAIN}
${ISO}
${SEED}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();

  vec2 c = vec2(u_x, u_y) * halfIso;
  vec2 rel = p - c;
  float r = max(length(rel), 0.0005);
  float theta = atan(rel.y, rel.x);
  float rho = log(r / 0.1) * 0.6;
  float th = theta + u_twist * 1.2 * rho;

  // Ray count: the angular period of the noise, integral so the field
  // closes on itself around the centre.
  float A = floor(8.0 + 72.0 * u_rays);
  vec2 so = seedOffset();
  float flowOut = loopTravel(0.05, vec2(0.0, 1.0), 4.0).y;
  float flowPk = loopTravel(0.2, vec2(0.0, 1.0), 12.0).y;

  vec2 sp = vec2(th / TAU * A, rho - flowOut + so.x);
  float rays = pnoise(sp, vec2(A, 4.0)) + 0.5 * pnoise(sp * 2.0 + vec2(0.0, so.y), vec2(2.0 * A, 8.0));
  // Packets: shorter along the ray and streaming out four times faster.
  float pk = pnoise(vec2(sp.x, rho * 3.0 - flowPk + so.y), vec2(A, 12.0));
  // Sector field: a few broad angular sectors that keep neighbouring rays
  // in one family, and the mask's contrast.
  float sector = pnoise(vec2(th / TAU * 6.0 + seedHash(3.0) * 6.0, 0.5), vec2(6.0, 1024.0));
  // Softer toward the centre, where the rays converge.
  float edge = mix(0.8, 0.2, u_sharp) + 0.4 * exp(-r / 0.3);
  float mask = smoothstep(-edge, edge, rays + 0.4 * pk + 0.3 * sector);

  float hole = 1.0 - exp(-(r * r) / (0.25 * 0.25));
  float env = mix(hole, 1.0 + 0.6 * exp(-r / 0.35), u_glow) * exp(-0.3 * r);
  float hot = u_glow * exp(-(r * r) / (0.16 * 0.16));

  float sway = 0.35 * sin(loopFreq(0.08) * u_time + u_seed);
  float theta0 = seedHash(2.0) * TAU + sway;
  float t = 0.5 + 0.5 * cos(th - theta0 + 2.0 * rays + 1.5 * sector);
  vec3 tint = palette(t);
  vec3 color = tint * (0.15 + 0.85 * mask * env);
  color = mix(color, vec3(1.0), hot * 0.85);

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
    // Ray count: 8 broad rays at 0, 80 needles at 1.
    { key: "rays", label: "Rays", min: 0, max: 1, step: 0.01, default: 0.45 },
    // Ray contrast: 0 is soft sectors, 1 is hard-edged rays.
    { key: "sharp", label: "Sharp", min: 0, max: 1, step: 0.01, default: 0.6 },
    // The centre: a dark tunnel at 0, a white-hot source at 1.
    { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, default: 0.7 },
    // Rays curve into a pinwheel.
    { key: "twist", label: "Twist", min: 0, max: 1, step: 0.01, default: 0.2 },
    { key: "x", label: "X", min: -1, max: 1, step: 0.01, default: 0.1 },
    { key: "y", label: "Y", min: -1, max: 1, step: 0.01, default: 0.05 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.14 },
  ],
  randomParams(rand) {
    return {
      rays: 0.2 + rand() * 0.7,
      sharp: 0.3 + rand() * 0.7,
      glow: 0.3 + rand() * 0.7,
      twist: rand() * 0.7,
      x: -0.7 + rand() * 1.4,
      y: -0.7 + rand() * 1.4,
      grain: 0.14,
    };
  },
};
