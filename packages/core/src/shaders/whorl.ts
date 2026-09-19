// "Whorl" look: a giant pinwheel of curved blades spiralling out of one
// point -- a nautilus section, a camera iris, a folded paper fan. Each blade
// has one razor leading edge and airbrushes away behind it into the next.
// Bloom's sibling: bloom is a radial fan of LOBES, whorl is a rotational
// stack of FOLDS, and it goes anywhere in the frame.
//
// SPEC
//
// 1. A SAWTOOTH IN LOG-POLAR SPACE. With (r, theta) about the centre:
//        u = k * (theta - rot) / TAU  +  k * twist * ln(r) / TAU  +  wobble
//        s = fract(u)
//    Lines of constant u are LOGARITHMIC SPIRALS (theta + twist*ln r = c),
//    the equiangular curve of shells and galaxies: every blade meets every
//    radius at the same angle, so the figure is self-similar and looks
//    identical at any zoom. fract() turns that smooth coordinate into k
//    sawtooth ramps -- a slow rise across each blade, then an instant drop.
//    The drop is the crease; nothing else in the image has an edge.
//    k is snapped to an integer so u jumps by exactly k across atan()'s
//    branch cut and fract() cannot see it.
//
// 2. THE PALETTE IS RADIAL, THE SAWTOOTH DISPLACES IT.
//        t = (1 - exp(-r / R))  +  depth * (s - 0.5)
//    Without the second term this is a plain radial gradient. With it, each
//    blade samples the ramp slightly ahead at its leading edge and slightly
//    behind at its trailing edge, so the radial gradient's level sets -- plain
//    circles -- shear into interlocking spiral scallops. Same trick as bloom
//    (shape lives in the level sets of one smooth ramp), different symmetry.
//
// 3. ANALYTIC AA ON THE CREASE. |du/dpixel| = k * sqrt(1 + twist^2) / (TAU r)
//    in closed form, so the sawtooth's drop is blended over exactly one pixel
//    at every radius; and because that width diverges at r -> 0 (all k
//    creases meet in a point), the sawtooth term is faded out over the last
//    few percent of radius, leaving a clean hot core instead of a moire knot.
//
// 4. ORGANIC WOBBLE. One low-frequency simplex octave is added to u. It
//    bends blades individually -- some fatten, some pinch -- which is what
//    takes the figure from "vector pinwheel" to something grown. The seed
//    re-rolls this field (hashed offset) and the starting rotation.
//
// 5. EXPLICIT PLACEMENT. u_x / u_y in frame half-extents (0 = centre, +-1 =
//    on the edge, beyond = off-frame). Off a corner it becomes a sweep of
//    near-parallel curved bands across the whole hero.
//
// 6. MOTION. The whorl turns: rot advances by loopAngle / k, i.e. by one
//    blade pitch per cycle -- which, by k-fold symmetry, is a full loop of
//    the image at 1/k-th of the rotation. The wobble field drifts (loopDrift)
//    so the blades also flex as they turn.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_blades;
uniform float u_twist;
uniform float u_depth;
uniform float u_scale;
uniform float u_wobble;
uniform float u_x;
uniform float u_y;
uniform float u_grain;

${SIMPLEX_2D}
${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();

  vec2 c = vec2(u_x, u_y) * halfIso;
  vec2 rel = p - c;
  float r = max(length(rel), 0.0001);
  float theta = atan(rel.y, rel.x);

  float k = floor(u_blades + 0.5);
  float rot = loopAngle(0.5) / k + seedHash(1.0) * TAU;

  vec2 drift = loopDrift(0.035, vec2(1.0, 0.0));
  float wob = u_wobble * 0.45 * snoise(p * 0.9 + seedOffset() + drift);

  float u = k * ((theta - rot) + u_twist * log(r)) / TAU + wob;
  float s = u - floor(u);

  // One-pixel blend across the sawtooth's drop (see header, point 3).
  float pixel = 2.0 * halfIso.y / u_resolution.y;
  float aa = clamp(k * sqrt(1.0 + u_twist * u_twist) / (TAU * r) * pixel * 1.5, 0.0, 0.5);
  s *= 1.0 - smoothstep(1.0 - aa, 1.0, s);

  float core = smoothstep(0.0, 0.08, r);
  float t = (1.0 - exp(-r / (0.6 * u_scale))) + u_depth * 0.5 * (s - 0.5) * core;
  vec3 color = palette(clamp(t, 0.0, 1.0));

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const whorl: ShaderDef = {
  id: "whorl",
  label: "Whorl",
  fragment: FRAGMENT,
  params: [
    { key: "blades", label: "Blades", min: 2, max: 24, step: 1, default: 9 },
    // Spiral pitch, signed: 0 = straight radial pleats (a paper fan), +-1 =
    // nautilus, +-3 = tightly wound galaxy. Sign picks the winding direction.
    { key: "twist", label: "Twist", min: -3, max: 3, step: 0.05, default: 1.1 },
    // Height of the crease at each blade edge. 0 is a plain radial gradient.
    { key: "depth", label: "Depth", min: 0, max: 1.5, step: 0.01, default: 0.8 },
    // Radius over which the palette runs from first stop (core) to last.
    { key: "scale", label: "Scale", min: 0.3, max: 3, step: 0.05, default: 1.2 },
    // Organic per-blade bending: 0 = perfect vector pinwheel.
    { key: "wobble", label: "Wobble", min: 0, max: 1, step: 0.01, default: 0.4 },
    // Centre position: 0 = middle, +-1 = frame edge, beyond = off-frame.
    { key: "x", label: "X", min: -1.5, max: 1.5, step: 0.01, default: -0.55 },
    { key: "y", label: "Y", min: -1.5, max: 1.5, step: 0.01, default: -0.7 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  ],
  randomParams(rand) {
    return {
      blades: Math.floor(5 + rand() * 12),
      // Signed, and kept off zero: the unwound fan is a legitimate setting
      // but a poor random draw next to any spiral.
      twist: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 2),
      depth: 0.5 + rand() * (1.2 - 0.5),
      scale: 0.8 + rand() * (2 - 0.8),
      wobble: rand() * 0.8,
      x: -1.1 + rand() * 2.2,
      y: -1.1 + rand() * 2.2,
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.06,
    };
  },
};
