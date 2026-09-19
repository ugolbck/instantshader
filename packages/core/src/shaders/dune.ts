// "Dune" look: a stack of huge overlapping crests rolling across the frame,
// back to front. Every crest has ONE razor edge -- its top -- and below that
// edge its colour airbrushes away into the body, until the next crest cuts
// across it. Flat, unlit, poster-graphic: the depth is all overlap and
// gradient, never light.
//
// SPEC
//
// 1. PAINTER'S ALGORITHM IN A FRAGMENT SHADER. There is no field to threshold
//    and no SDF union: the layers are composited in order, back (top of
//    frame) to front (bottom), each one a half-plane bounded above by an
//    analytic curve
//        e_i(x) = base_i + swell * (0.6 sin(f_i x + phi_i +- a1)
//                                 + 0.4 sin(1.7 f_i x + psi_i - a2))
//    and `color = mix(color, layer_i, coverage_i)`. Overlap order is therefore
//    exact and free -- crests may cross each other arbitrarily and the front
//    one always wins, which a single scalar field can never give you.
//
// 2. THE BLOOM RECIPE, LINEARISED: one hard discontinuity, one long fade.
//    Inside layer i, with depth = e_i(x) - y measured below its own crest:
//        t = t_i - fade * (1 - exp(-depth / 0.3)) / n
//    The crest line carries the layer's own ramp stop; the body decays toward
//    the PREVIOUS stop. So at every crest the image jumps roughly two stops
//    (the faded body of the layer behind against the fresh crest in front):
//    that jump is the crease, and it is the only edge in the picture.
//
// 3. COVERAGE = ANALYTIC AA + OPTIONAL BLUR. coverage = smoothstep(-w, w,
//    depth) with w = one pixel in layer units, plus u_soft. At soft 0 the
//    crests are vector-crisp at any resolution; raised, the same term becomes
//    a wide feather and the stack turns into banks of fog.
//
// 4. PER-LAYER IDENTITY FROM THE SEED HASH. Wavelength (0.75-1.25x), both
//    phases, travel direction, and a lengthwise colour drift along each crest
//    are all seedHash(i) channels, so the seed re-rolls the entire skyline.
//    The palette is laid out back to front: first stop is the sky, last stop
//    is the nearest crest.
//
// 5. MOTION. Every crest's two harmonics travel sideways at different
//    whole-cycle rates (loopAngle), in a per-layer direction, so neighbouring
//    crests slide against each other and their crossings migrate -- the
//    parallax of dunes or swell seen side-on, with no actual parallax maths.
//
// Against its siblings: strata is contour islands seen from above; dune is
// a horizon seen from the side, and the only look built by compositing.

import type { ShaderDef } from "../types";
import { GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_layers;
uniform float u_swell;
uniform float u_waves;
uniform float u_fade;
uniform float u_soft;
uniform float u_angle;
uniform float u_grain;

${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const float PI = 3.14159265;

void main() {
  vec2 uv = worldUv();
  vec2 iso = isoCoord(uv);
  vec2 halfIso = isoHalf();

  // Layer frame: x runs along the crests, y is "up", normalised so the
  // visible frame spans y = -1..1 at every angle and aspect.
  float ang = u_angle * PI / 180.0;
  vec2 ax = vec2(cos(ang), sin(ang));
  vec2 ay = vec2(-ax.y, ax.x);
  float spanY = halfIso.x * abs(ay.x) + halfIso.y * abs(ay.y);
  float x = dot(iso, ax);
  float y = dot(iso, ay) / spanY;

  float n = floor(u_layers + 0.5);
  float a1 = loopAngle(0.22);
  float a2 = loopAngle(0.36);
  float k = PI * u_waves;

  float pixel = 2.0 * halfIso.y / u_resolution.y / spanY;
  float w = pixel + u_soft * 0.22;

  // Sky: the first stop, itself graded a little so it is not a flat fill.
  vec3 color = palette(0.04 * (1.0 - y));

  for (int li = 0; li < 12; li++) {
    float i = float(li);
    if (i >= n) break;

    float h1 = seedHash(i * 3.0 + 1.0);
    float h2 = seedHash(i * 3.0 + 2.0);
    float h3 = seedHash(i * 3.0 + 3.0);

    // Crest baselines spread from near the top to near the bottom.
    float base = mix(0.72, -0.8, i / max(n - 1.0, 1.0));
    float fi = k * (0.75 + 0.5 * h1);
    float dir = h3 < 0.5 ? -1.0 : 1.0;
    float edge = base + u_swell * 0.5 * (0.6 * sin(fi * x + h2 * TAU + dir * a1)
                                       + 0.4 * sin(fi * 1.7 * x + h3 * TAU - a2));

    float depth = edge - y;
    float coverage = smoothstep(-w, w, depth);

    float ti = (i + 1.0) / n;
    float body = 1.0 - exp(-max(depth, 0.0) / 0.3);
    // Lengthwise drift: the crest colour wanders a third of a stop along x.
    float along = 0.35 * sin(x * 1.1 + h1 * TAU + dir * a2);
    float t = ti + (along - u_fade * 1.15 * body) / n;

    color = mix(color, palette(clamp(t, 0.0, 1.0)), coverage);
  }

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const dune: ShaderDef = {
  id: "dune",
  label: "Dune",
  fragment: FRAGMENT,
  params: [
    { key: "layers", label: "Layers", min: 2, max: 12, step: 1, default: 6 },
    // Crest height. 0 = ruler-flat stripes; high = crests tall enough to
    // cross and swallow each other.
    { key: "swell", label: "Swell", min: 0, max: 1.6, step: 0.01, default: 0.7 },
    // Undulations across the frame: below 1 a crest is one long slope, above
    // 3 it is a rolling sea.
    { key: "waves", label: "Waves", min: 0.3, max: 5, step: 0.05, default: 1.4 },
    // How far each body airbrushes back toward the previous colour: 0 = flat
    // paper-cut fills, 1 = deep gradient and the strongest crease at each crest.
    { key: "fade", label: "Fade", min: 0, max: 1.5, step: 0.01, default: 0.9 },
    // Crest edge: 0 = vector-crisp, 1 = banks of fog.
    { key: "soft", label: "Soft", min: 0, max: 1, step: 0.01, default: 0.02 },
    { key: "angle", label: "Angle", min: 0, max: 360, step: 1, default: 352 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.05 },
  ],
  randomParams(rand) {
    return {
      layers: Math.floor(4 + rand() * 6),
      swell: 0.4 + rand() * (1.2 - 0.4),
      waves: 0.7 + rand() * (2.8 - 0.7),
      fade: 0.6 + rand() * (1.3 - 0.6),
      // Mostly crisp; occasionally foggy.
      soft: rand() < 0.75 ? rand() * 0.06 : 0.2 + rand() * 0.5,
      // Near-horizontal either way up, or a steep diagonal now and then.
      angle: Math.floor((rand() < 0.7 ? -25 + rand() * 50 : rand() * 360) + 360) % 360,
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.05,
    };
  },
};
