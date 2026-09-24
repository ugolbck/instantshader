// "Wisp" look: molten filaments. A dark ground, a tangle of hair-thin
// luminous threads, each with a white-hot core and a coloured glow, and
// sparks where two threads cross.
//
// SPEC
//
// 1. THREADS ARE ZERO-CROSSINGS. For a noise field n in [-1, 1], the set
//    n = 0 is a family of smooth closed curves that wander and never branch,
//    which is how poured metal looks. 1 - |n| peaks along them; a Gaussian
//    in n makes that peak a thread with a soft glow. Two independent fields
//    give two families that cross. The thread's on-screen width is
//    |grad n|-dependent, deliberately: it swells where the field is flat
//    and thins where it is steep, like a real melt.
//
// 2. FOUR TERMS PER FAMILY: haze (very wide, faint, tints the dark), glow
//    (wide Gaussian, palette colour), core (narrow Gaussian, 70% white), and
//    sparks: the product of the two cores (a spot at each crossing) plus
//    beads where a third field's zero line crosses a thread.
//
// 3. PALETTE ALONG THE THREAD. A slow third field per family lays the ramp
//    along each thread, so colour changes along its length and neighbouring
//    threads differ. The glow beside any thread reaches the stop's full
//    colour, so every bank keeps its saturation.
//
// 4. EMISSIVE on the crushed darkest stop (beam's recipe), with the white
//    core keeping dark banks visible and the gain keeping pastel banks from
//    washing.
//
// 5. MOTION. The two thread fields drift on separate loopDrift paths; the
//    colour fields drift with them; a per-thread flicker rides loopFreq.
//
// Against its siblings: beam is one wide streak; wisp is many threads.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, FBM, SHAPE, GRAIN, ISO, SEED } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_width;
uniform float u_glow;
uniform float u_sparks;
uniform float u_grain;

${SIMPLEX_2D}
${FBM}
${SHAPE}
${GRAIN}
${ISO}
${SEED}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);

  vec2 so = seedOffset();
  float f = 0.75 * u_scale;
  vec2 driftA = loopDrift(0.03, vec2(1.0, 0.0));
  vec2 driftB = loopDrift(0.022, vec2(0.0, 1.0));

  // One smooth octave plus a faint second: fbm2's full second octave made
  // the threads wriggle like neon; poured metal runs in long slow curves.
  float nA = snoise(p * f + so + driftA) + 0.25 * snoise(p * f * 2.0 + so + driftA * 1.5);
  float nB = snoise(p * f * 1.3 + so.yx + 40.0 + driftB) + 0.25 * snoise(p * f * 2.6 + so.yx + 40.0 + driftB * 1.5);
  // A third field only for beads: where it crosses a thread, a hot point.
  float nC = snoise(p * f * 2.2 + so * 0.5 + 21.0 + driftA.yx);

  float wc = 0.03 * u_width;
  float wg = 0.14 * u_width;
  float wh = 0.6 * u_width;
  float coreA = exp(-(nA * nA) / (wc * wc));
  float coreB = exp(-(nB * nB) / (wc * wc));
  float glowA = exp(-(nA * nA) / (wg * wg));
  float glowB = exp(-(nB * nB) / (wg * wg));
  // Haze: a very wide, faint glow that tints the dark near every thread.
  float hazeA = exp(-(nA * nA) / (wh * wh));
  float hazeB = exp(-(nB * nB) / (wh * wh));
  float beadC = exp(-(nC * nC) / (wc * wc * 2.5));
  float beadGlow = exp(-(nC * nC) / (wg * wg));
  float spark = coreA * coreB + 0.8 * beadC * (coreA + coreB);
  float sparkGlow = beadGlow * (glowA + glowB) * 0.5;

  // Threads fade in and out along their length: a slow field gates each
  // family, so a thread is bright for a stretch, dims, and returns. A
  // uniformly lit thread read as a neon tube.
  float mA = smoothstep(-0.55, 0.35, snoise(p * f * 0.9 + so + 63.0 + driftB.yx));
  float mB = smoothstep(-0.55, 0.35, snoise(p * f * 0.9 + so.yx + 91.0 + driftA.yx));
  coreA *= mA; glowA *= mA;
  coreB *= mB; glowB *= mB;

  float tA = spread(fbm2(p * 0.5 + so + 7.0 + driftA), 0.35);
  float tB = spread(fbm2(p * 0.5 + so.yx + 53.0 + driftB), 0.35);
  vec3 cA = palette(tA);
  vec3 cB = palette(tB);
  float lA = dot(cA, LUMA);
  float lB = dot(cB, LUMA);

  // Flicker per thread, keyed on the thread's ramp position.
  float flA = 1.0 + 0.25 * sin(loopFreq(0.5) * u_time + 20.0 * tA + u_seed);
  float flB = 1.0 + 0.25 * sin(loopFreq(0.5) * u_time + 20.0 * tB + 2.0 + u_seed);

  // Background: the ramp's darkest stop, crushed (as in beam).
  vec3 c0 = palette(0.0);
  vec3 c1 = palette(0.5);
  vec3 c2 = palette(1.0);
  float l0 = dot(c0, LUMA);
  float l1 = dot(c1, LUMA);
  float l2 = dot(c2, LUMA);
  vec3 dk = mix(c0, c1, step(l1, l0));
  dk = mix(dk, c2, step(l2, min(l0, l1)));
  vec3 color = dk * 0.1;

  float gA = 1.0 / (1.0 + 1.2 * lA * lA);
  float gB = 1.0 / (1.0 + 1.2 * lB * lB);
  float bA = 1.0 + 2.0 * (1.0 - lA) * (1.0 - lA) * (1.0 - lA);
  float bB = 1.0 + 2.0 * (1.0 - lB) * (1.0 - lB) * (1.0 - lB);
  float gw = 0.35 + 0.65 * u_glow;

  color += cA * hazeA * 0.12 * gA * bA;
  color += cB * hazeB * 0.12 * gB * bB;
  color += cA * glowA * gw * gA * bA * flA;
  color += cB * glowB * gw * gB * bB * flB;
  color += mix(cA, vec3(1.0), 0.7) * coreA * 1.1 * flA;
  color += mix(cB, vec3(1.0), 0.7) * coreB * 1.1 * flB;
  color += vec3(1.0) * spark * 2.5 * u_sparks;
  color += mix(cA + cB, vec3(2.0), 0.5) * sparkGlow * 0.5 * u_sparks;

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const wisp: ShaderDef = {
  id: "wisp",
  label: "Wisp",
  fragment: FRAGMENT,
  params: [
    { key: "scale", label: "Scale", min: 0.5, max: 2.5, step: 0.05, default: 1.2 },
    // Thread thickness, core and glow together.
    { key: "width", label: "Width", min: 0.3, max: 2, step: 0.01, default: 1 },
    // Coloured glow around each thread.
    { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, default: 0.6 },
    // White spots where threads cross.
    { key: "sparks", label: "Sparks", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    return {
      scale: 0.7 + rand() * (2 - 0.7),
      width: 0.6 + rand() * (1.6 - 0.6),
      glow: 0.3 + rand() * (1 - 0.3),
      sparks: rand(),
      grain: 0.08,
    };
  },
};
