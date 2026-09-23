// "Caustic" look: sunlight on a pool floor. Circular waves from a handful of
// seeded sources interfere on the surface, and the light refracted through
// that surface bunches up along the folds of the refraction map into a
// bright wandering net.
//
// SPEC
//
// 1. THE SURFACE IS A SUM OF ANALYTIC WAVES. Source i is a circular wave
//    h_i = A_i sin(k_i r_i - phase_i) about a centre C_i (the last two are
//    planar, h_i = A_i sin(k_i dot(p, D_i) - phase_i), so the net never
//    settles into rings). Everything about h is closed form, including its
//    gradient and Hessian, which is what makes point 2 possible in one pass.
//
// 2. THE NET IS A JACOBIAN, NOT A TEXTURE. Light entering a wavy surface is
//    displaced by u = kappa * grad h (paraxial refraction; kappa = depth of
//    water times (1 - 1/eta)). Where that map compresses area the light
//    concentrates, so its brightness is 1 / |det J| with J = I + kappa * Hess h.
//    det J -> 0 along the folds of the map, and those folds ARE the caustic
//    lines: thin, bright, joined into cells, thickening where two folds
//    meet. No blur, no second pass, no sampling: one determinant per pixel.
//    One Newton step (p1 = p - u(p)) first, so the pixel reads the light
//    landing on it rather than the light leaving above it.
//
// 3. PALETTE BY HEIGHT. t = spread(h) -- the same Gaussian equalisation as
//    flow, because a sum of sines is close to Gaussian -- so the floor is a
//    soft gradient through every stop, and the net is added on top as the
//    last stop lifted toward white. Two-colour banks read as water and
//    light; eight-colour banks as a stained floor under it.
//
// 4. MOTION. Each source's phase turns through loopAngle at its own rate,
//    every other ring travelling inward, so the interference never repeats
//    within a cycle but every cycle is exact.
//
// Against its siblings: flow is currents, caustic is LIGHT THROUGH WATER --
// the only look whose brightness comes from an area measure.

import type { ShaderDef } from "../types";
import { GRAIN, ISO, LOOP_ANGLE, SEED, SHAPE } from "./noise";

const FRAGMENT = `
uniform float u_waves;
uniform float u_scale;
uniform float u_ripple;
uniform float u_depth;
uniform float u_light;
uniform float u_grain;

${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}
${SHAPE}

const int MAX_WAVES = 8;

// Height, gradient and Hessian (xx, yy, xy) of the surface at p.
void surface(vec2 p, float n, out float h, out vec2 g, out vec3 H, out float var) {
  h = 0.0;
  var = 0.0;
  g = vec2(0.0);
  H = vec3(0.0);
  for (int i = 0; i < MAX_WAVES; i++) {
    float fi = float(i);
    if (fi >= n) break;
    float h1 = seedHash(fi * 5.0 + 1.0);
    float h2 = seedHash(fi * 5.0 + 2.0);
    float h3 = seedHash(fi * 5.0 + 3.0);
    float h4 = seedHash(fi * 5.0 + 4.0);

    // Wavelength 0.25-0.5 frame heights at scale 1; amplitude is set as a
    // SLOPE (A * k) so the net's density does not change with the wavelength.
    float k = TAU / (u_scale * (0.25 + 0.25 * h1));
    float slope = u_ripple * 0.05 * (0.6 + 0.4 * h2);
    float A = slope / k;
    float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float phase = dir * loopAngle(0.3 + 0.4 * h3) + TAU * h4;

    float s; float c; vec2 e; float invR;
    if (i < 6) {
      // Circular: centres up to 0.4 outside the frame, so waves also come
      // in from off-screen instead of all radiating from visible points.
      vec2 C = (vec2(h3, h4) * 2.0 - 1.0) * (isoHalf() + 0.4);
      vec2 d = p - C;
      // r is softened near the centre (sqrt(d^2 + eps^2)): the curvature
      // term below is 1/r, and an unsoftened centre inside the frame printed
      // a bright speck. With this r, e = d/r is no longer unit length, and
      // the Hessian formula stays exact for it.
      float r = sqrt(dot(d, d) + 0.01);
      e = d / r;
      invR = 1.0 / r;
      float ph = k * r - phase;
      s = sin(ph); c = cos(ph);
    } else {
      float ang = h1 * TAU;
      e = vec2(cos(ang), sin(ang));
      invR = 0.0; // a plane wave has no curvature term
      float ph = k * dot(p, e) - phase;
      s = sin(ph); c = cos(ph);
    }
    h += A * s;
    var += 0.5 * A * A; // variance of an independent sine
    g += A * k * c * e;
    // Hessian of A sin(k r): -A k^2 s (e e^T) + A k c (I - e e^T) / r.
    float rad = -A * k * k * s;
    float tan_ = A * k * c * invR;
    H.x += rad * e.x * e.x + tan_ * (1.0 - e.x * e.x);
    H.y += rad * e.y * e.y + tan_ * (1.0 - e.y * e.y);
    H.z += (rad - tan_) * e.x * e.y;
  }
}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  float n = floor(u_waves + 0.5);

  float kappa = 2.0 * u_depth;

  float h; vec2 g; vec3 H; float var;
  surface(p, n, h, g, H, var);
  // Read the light where it lands: one Newton step back along the map.
  vec2 p1 = p - kappa * g;
  float h1; vec2 g1; vec3 H1; float var1;
  surface(p1, n, h1, g1, H1, var1);

  float det = (1.0 + kappa * H1.x) * (1.0 + kappa * H1.y) - kappa * kappa * H1.z * H1.z;
  // 1/|det| - 1: positive where light bunches, negative where it thins.
  float light = 1.0 / max(abs(det), 0.12) - 1.0;

  // Ramp: a slow seeded sweep across the frame (two long waves, wavelength
  // about a frame and a half, turning slowly), stirred by the ripples. The
  // sweep is what lays every stop out in order; the ripple term keeps the
  // colour boundaries from being straight lines.
  vec2 d1 = vec2(cos(seedHash(41.0) * TAU), sin(seedHash(41.0) * TAU));
  vec2 d2 = vec2(cos(seedHash(43.0) * TAU), sin(seedHash(43.0) * TAU));
  float sweep = 0.7 * sin(dot(p, d1) * 4.0 + loopAngle(0.08) + seedHash(45.0) * TAU)
              + 0.4 * sin(dot(p, d2) * 6.5 - loopAngle(0.11) + seedHash(47.0) * TAU);
  float t = spread(sweep + 0.4 * h / (sqrt(var) + 1e-5), 0.75);
  vec3 color = palette(t);

  vec3 lightCol = mix(palette(1.0), vec3(1.0), 0.5);
  color *= 1.0 + 0.25 * u_light * min(light, 0.0);
  color += lightCol * u_light * 0.28 * clamp(light, 0.0, 5.0);

  float gr = grain(uv, u_time) - 0.5;
  color += gr * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const caustic: ShaderDef = {
  id: "caustic",
  label: "Caustic",
  fragment: FRAGMENT,
  params: [
    // Interfering sources. Below 4 the net is a lattice; 8 is open water.
    { key: "waves", label: "Waves", min: 3, max: 8, step: 1, default: 6 },
    { key: "scale", label: "Scale", min: 0.5, max: 2.5, step: 0.05, default: 1 },
    // Wave steepness: how far the floor gradient wanders.
    { key: "ripple", label: "Ripple", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Water depth: 0 is a flat floor, 1 folds the light into the sharpest net.
    { key: "depth", label: "Depth", min: 0, max: 1, step: 0.01, default: 0.7 },
    // Brightness of the net.
    { key: "light", label: "Light", min: 0, max: 1, step: 0.01, default: 0.8 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  ],
  randomParams(rand) {
    return {
      waves: Math.floor(4 + rand() * 5),
      scale: 0.7 + rand() * (2 - 0.7),
      ripple: 0.4 + rand() * (0.9 - 0.4),
      // Under ~0.4 the map never folds and the net is gone; this look is
      // the net.
      depth: 0.5 + rand() * (1 - 0.5),
      light: 0.5 + rand() * (1 - 0.5),
      grain: 0.06,
    };
  },
};
