// "Wisp" look: molten filaments. A dark ground and luminous threads that
// run the same way across the frame, each with a white-hot core and a
// coloured glow, breaking and returning along their length, with hot
// beads where a slower field crosses them.
//
// SPEC
//
// 1. THREADS ARE CONTOURS OF ONE FIELD. For a noise field n in [-1, 1],
//    the level sets n = 0 and |n| = 0.6 are families of smooth curves that
//    wander, never branch, and, being contours of one field, never cross:
//    a thread beside a thread, the way poured metal runs. (Two independent
//    fields gave a lattice of crossings that read as a network diagram.)
//    A Gaussian in the signed distance to each level makes a thread with a
//    soft glow; its on-screen width follows |grad n|, swelling where the
//    field is flat, like a real melt.
//
// 2. THE FIELD IS SHAPED, so the look has a range. u_stretch compresses
//    the domain along u_angle (silk's trick), from isotropic pools at 0 to
//    long streaks at 1; u_warp pushes the sample point by a second field,
//    from calm arcs at 0 to turbulent swirls at 1.
//
// 3. FOUR TERMS PER THREAD: haze (very wide, faint, tints the dark), glow
//    (wide Gaussian, palette colour), core (narrow Gaussian, 70% white),
//    and beads where a third field's zero line crosses the thread. A slow
//    gating field fades each thread family in and out along its length.
//
// 4. PALETTE ALONG THE THREAD. A slow field per family lays the ramp along
//    each thread, so colour changes along its length and neighbouring
//    threads differ. The glow beside any thread reaches the stop's full
//    colour, so every bank keeps its saturation.
//
// 5. EMISSIVE on the crushed darkest stop (beam's recipe), with the white
//    core keeping dark banks visible and the gain keeping pastel banks from
//    washing.
//
// 6. MOTION. The field and the warp drift on separate loopDrift paths; the
//    colour fields drift with them; a per-thread flicker rides loopFreq.
//
// Against its siblings: beam is one wide streak; wisp is many threads.
// Strata is bands of a stretched field; wisp is the lines between them,
// lit, on dark.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, FBM, SHAPE, GRAIN, ISO, SEED } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_width;
uniform float u_stretch;
uniform float u_angle;
uniform float u_warp;
uniform float u_glow;
uniform float u_sparks;
uniform float u_grain;

${SIMPLEX_2D}
${FBM}
${SHAPE}
${GRAIN}
${ISO}
${SEED}

const float PI = 3.14159265;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);

  vec2 so = seedOffset();
  float f = 0.75 * u_scale;
  vec2 driftA = loopDrift(0.03, vec2(1.0, 0.0));
  vec2 driftB = loopDrift(0.022, vec2(0.0, 1.0));

  // Stream space: rotate to u_angle, then compress along it so the field's
  // features are long in that direction.
  float ang = u_angle * PI / 180.0;
  vec2 q = vec2(p.x * cos(ang) + p.y * sin(ang), -p.x * sin(ang) + p.y * cos(ang));
  q.x *= mix(1.0, 0.3, u_stretch);

  // Warp: a second field pushes the sample point, so the threads swirl.
  vec2 wq = q * f * 0.6 + so.yx + 29.0 + driftB;
  vec2 warp = u_warp * 0.7 * vec2(snoise(wq), snoise(wq + vec2(7.3, 2.9)));
  vec2 s = q * f + so + driftA + warp;
  // One smooth octave plus a faint second: a full second octave made the
  // threads wriggle like neon; poured metal runs in long slow curves.
  float n = snoise(s) + 0.2 * snoise(s * 2.0 + 11.0);
  // A third field only for beads: where it crosses a thread, a hot point.
  float nC = snoise(q * f * 2.2 + so * 0.5 + 21.0 + driftA.yx);

  // Two thread families from one field: its zero line and its |n| = 0.5
  // contours, either side of it.
  float dA = n;
  float dB = abs(n) - 0.5;

  // A melt is not a tube: the thread swells and thins along its length,
  // by a slow field, and the core's heat comes and goes with it.
  float swell = 0.45 + 1.1 * smoothstep(-0.7, 0.7, snoise(q * f * 0.7 + so.yx + 77.0 + driftA));
  float wc = 0.04 * u_width * swell;
  float wg = 0.16 * u_width * swell;
  float wh = 0.6 * u_width;
  float coreA = exp(-(dA * dA) / (wc * wc));
  float coreB = exp(-(dB * dB) / (wc * wc));
  float glowA = exp(-(dA * dA) / (wg * wg));
  float glowB = exp(-(dB * dB) / (wg * wg));
  float hazeA = exp(-(dA * dA) / (wh * wh));
  float hazeB = exp(-(dB * dB) / (wh * wh));
  float beadC = exp(-(nC * nC) / (wc * wc * 2.5));
  float beadGlow = exp(-(nC * nC) / (wg * wg));
  float spark = 0.8 * beadC * (coreA + coreB);
  float sparkGlow = beadGlow * (glowA + glowB) * 0.5;

  // Threads fade in and out along their length: a slow field gates each
  // family, so a thread is bright for a stretch, dims, and returns.
  float mA = smoothstep(-0.55, 0.35, snoise(q * f * 0.9 + so + 63.0 + driftB.yx));
  float mB = smoothstep(-0.45, 0.45, snoise(q * f * 0.9 + so.yx + 91.0 + driftA.yx));
  // The core fades faster than the glow, so a dimming thread goes from
  // white-hot to coloured before it goes out.
  coreA *= mA * mA; glowA *= mA; hazeA *= mA;
  coreB *= mB * mB; glowB *= mB; hazeB *= mB;

  float tA = spread(fbm2(q * 0.5 + so + 7.0 + driftA), 0.35);
  float tB = spread(fbm2(q * 0.5 + so.yx + 53.0 + driftB), 0.35);
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
  color += mix(cA, vec3(1.0), 0.55) * coreA * 0.9 * flA;
  color += mix(cB, vec3(1.0), 0.55) * coreB * 0.9 * flB;
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
    // 0 is pooled arcs, 1 is long streaks along the angle.
    { key: "stretch", label: "Stretch", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "angle", label: "Angle", min: 0, max: 360, step: 1, default: 20 },
    // 0 is calm curves, 1 is turbulent swirls.
    { key: "warp", label: "Warp", min: 0, max: 1, step: 0.01, default: 0.5 },
    // Coloured glow around each thread.
    { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, default: 0.6 },
    // Hot beads along the threads.
    { key: "sparks", label: "Sparks", min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    return {
      scale: 0.7 + rand() * (2 - 0.7),
      width: 0.6 + rand() * (1.6 - 0.6),
      stretch: rand(),
      angle: Math.floor(rand() * 360),
      warp: rand() * 0.8,
      glow: 0.3 + rand() * (1 - 0.3),
      sparks: rand() * 0.7,
      grain: 0.08,
    };
  },
};
