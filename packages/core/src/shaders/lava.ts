// "Lava" look: a lava lamp. Blobs of wax rise, drift and fuse. The silhouette
// is a level set of one implicit field, so two blobs that touch grow a neck
// and merge into one shape instead of overlapping like two discs.
//
// SPEC
//
// 1. AN IMPLICIT SURFACE. F(p) = sum_i exp(-|p - c_i|^2 / s_i^2), a sum of
//    Gaussians (metaballs). The wax is F > th. Everything about the merge
//    behaviour -- the neck, the pinch-off, the way a small blob is absorbed
//    -- falls out of the level set; there is no per-blob drawing.
//
// 2. ANALYTIC EDGE. grad F is free (each term's gradient is its value times
//    -2 (p - c_i) / s_i^2), so the silhouette is blended over exactly one
//    pixel from |grad F| * pixel, and u_goo widens that blend into a cloud.
//
// 3. THE RAMP HAS TWO HALVES. Outside the wax the first 30% of the ramp is a
//    faint vertical grade (bottom to top), so the first stops are the
//    lamp's body. Inside, t climbs from 0.5 at the edge toward 1 at the
//    core with F, so a blob's centre is the last stop and a merged pair
//    shares one hot core. With two colours it is wax and glass; with eight,
//    every stop has a home.
//
// 4. MOTION. Each blob orbits its home on its own loopAngle rate and phase,
//    so the composition is exactly periodic; the stretch axis makes the
//    orbits tall ellipses, which reads as wax rising and falling rather
//    than circling.
//
// Against its siblings: bloom is one figure, lava is MANY that become one.

import type { ShaderDef } from "../types";
import { GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_blobs;
uniform float u_size;
uniform float u_merge;
uniform float u_goo;
uniform float u_stretch;
uniform float u_grain;

${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const int MAX_BLOBS = 8;

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();
  // Squash y so that a round Gaussian in this space is a tall ellipse on
  // screen. Gradients are taken in this space and rescaled below.
  vec2 sq = vec2(1.0, 1.0 / u_stretch);
  vec2 q = p * sq;

  float n = floor(u_blobs + 0.5);
  float F = 0.0;
  vec2 G = vec2(0.0);
  for (int i = 0; i < MAX_BLOBS; i++) {
    float fi = float(i);
    if (fi >= n) break;
    float h1 = seedHash(fi * 6.0 + 1.0);
    float h2 = seedHash(fi * 6.0 + 2.0);
    float h3 = seedHash(fi * 6.0 + 3.0);
    float h4 = seedHash(fi * 6.0 + 4.0);
    float h5 = seedHash(fi * 6.0 + 5.0);

    // Homes on a jittered 4x2 grid so the frame is covered evenly, visited
    // in the order 0,5,2,7,4,1,6,3 so that a low blob count still spans both
    // rows. Orbits of 0.08-0.3, one blob in three going the other way round.
    float slot = mod(fi * 5.0, 8.0);
    vec2 cell = vec2(mod(slot, 4.0), floor(slot / 4.0));
    vec2 home = ((cell + vec2(h1, h2)) / vec2(4.0, 2.0) * 2.0 - 1.0) * halfIso * vec2(0.9, 0.7) * sq;
    float R = 0.08 + 0.22 * h3;
    float dir = h5 < 0.33 ? -1.0 : 1.0;
    float a = dir * loopAngle(0.15 + 0.2 * h4) + TAU * h5;
    vec2 c = home + R * vec2(cos(a), sin(a) * 1.4);
    float s = u_size * (0.6 + 0.6 * h4);

    vec2 d = q - c;
    float e = exp(-dot(d, d) / (s * s));
    F += e;
    G += e * (-2.0 * d / (s * s));
  }

  // Edge: analytic one-pixel blend, widened by softness. The gradient is
  // in squashed space; the y component is steeper on screen by 1/stretch.
  float pixel = 2.0 * halfIso.y / u_resolution.y;
  float gradPx = length(G * sq) * pixel;
  // Quadratic so the top of the slider is a genuinely crisp edge.
  float soft = 0.35 * (1.0 - u_goo) * (1.0 - u_goo);
  float w = gradPx * 1.5 + soft + 0.0001;
  float th = u_merge;
  float cov = smoothstep(th - w, th + w, F);

  float grade = 0.5 + 0.5 * clamp(p.y / halfIso.y, -1.0, 1.0);
  float tOut = 0.3 * grade;
  float tIn = 0.5 + 0.5 * smoothstep(th, th + 0.6, F);
  float t = mix(tOut, tIn, cov);
  vec3 color = palette(t);

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const lava: ShaderDef = {
  id: "lava",
  label: "Lava",
  fragment: FRAGMENT,
  params: [
    { key: "blobs", label: "Blobs", min: 2, max: 8, step: 1, default: 6 },
    // Blob radius in frame heights.
    { key: "size", label: "Size", min: 0.1, max: 0.5, step: 0.01, default: 0.22 },
    // Level-set threshold. Low = fat blobs that fuse into one mass; high =
    // small separate drops.
    { key: "merge", label: "Merge", min: 0.3, max: 0.9, step: 0.01, default: 0.5 },
    // Edge: 1 is a razor silhouette, 0 a soft cloud.
    { key: "goo", label: "Goo", min: 0, max: 1, step: 0.01, default: 0.85 },
    // Vertical elongation of blobs and orbits.
    { key: "stretch", label: "Stretch", min: 1, max: 2.5, step: 0.05, default: 1.4 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  ],
  randomParams(rand) {
    return {
      blobs: Math.floor(3 + rand() * 6),
      size: 0.14 + rand() * (0.36 - 0.14),
      merge: 0.35 + rand() * (0.8 - 0.35),
      // Mostly crisp; a cloud now and then.
      goo: rand() < 0.75 ? 0.7 + rand() * 0.3 : rand() * 0.5,
      stretch: 1 + rand() * 1.2,
      grain: 0.06,
    };
  },
};
