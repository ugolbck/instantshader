// "Flow" look: a curl-noise vector field advects the sample point before it
// hits fbm, producing swirling, fluid-like currents instead of a static
// warp. Curl noise (the rotated gradient of a scalar potential) is
// divergence-free by construction -- no sources or sinks -- so the flow
// never looks like it's leaking out of or pooling into one spot, which is
// what makes it read as continuous currents rather than random jitter.
//
// Against beam: beam (in its first, pre-rework form) was diffuse and radial
// (soft lobes breathing out of a glow core, no defined edges anywhere),
// while flow is the one with CURRENTS -- big isotropic swirls with defined
// luminous edges and generous calm negative space. Its two defining
// settings are the curl field being coarser than the colour masses it
// carries, and `openness` widening the palette's first colour into that
// calm.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, PERIODIC_2D, FBM, SHAPE, GRAIN } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_drift;
uniform float u_openness;
uniform float u_grain;

${SIMPLEX_2D}
${PERIODIC_2D}
${FBM}
${SHAPE}
${GRAIN}

// Curl of a scalar potential field: the finite-difference gradient, rotated
// 90 degrees -- (dPsi/dy, -dPsi/dx) instead of (dPsi/dx, dPsi/dy). A rotated
// gradient is always divergence-free, which is the whole trick: advecting a
// point along it produces swirling motion with nothing to make it converge
// or diverge, unlike advecting along the gradient itself.
//
// The potential is pnoise, not snoise, and it is pnoise in BOTH looping and
// non-looping modes on purpose. A tiling field is what lets the drift travel
// in a straight line and still return (see loopTravel), and having the two
// modes disagree about which noise they use would mean tuning a look in one
// and shipping the other. The fbm below still uses snoise: it never sees the
// drift, so it never needed to tile, and leaving it alone keeps the colour
// masses' texture exactly as it was.
vec2 curl(vec2 p, float tile) {
  // Finite-difference step: small enough to approximate a derivative, large
  // enough that the noise's own float precision doesn't swamp the difference
  // between the two samples.
  float eps = 0.05;
  vec2 rep = vec2(tile);
  float dx = (pnoise(p + vec2(eps, 0.0), rep) - pnoise(p - vec2(eps, 0.0), rep)) / (2.0 * eps);
  float dy = (pnoise(p + vec2(0.0, eps), rep) - pnoise(p - vec2(0.0, eps), rep)) / (2.0 * eps);
  return vec2(dy, -dx);
}

void main() {
  vec2 uv = worldUv();
  // Slow crawl so currents read as continuous, not jittery. Half the rate an
  // earlier prototype of this shader used, because this one has leverage: the
  // drift only enters the curl coordinate, and rotating the advection field
  // moves the sampled point much further than nudging an fbm coordinate
  // directly would. At 0.05 (that earlier prototype's rate) the whole
  // composition reorganized every ~3 seconds, measured as more pixel change
  // over 3.5s than the beam prototype showed over 7.5s.
  //
  // The curl field is sampled at 0.55x the fbm's frequency (see below), so
  // the visible frame spans curlScale units of noise. The tile has to be at
  // least twice that or the field repeats inside a single frame, which looks
  // like wallpaper; ceil keeps it integral, which pnoise requires.
  float curlScale = u_scale * 0.55;
  float tile = max(2.0, ceil(curlScale * 2.0));

  // Straight-line travel through a tiling field: the direction never changes,
  // so this reads as continuous flow rather than the sway a circular path
  // gives. One tile per loop, hence rate = tile/u_loop -- a short loop flows
  // fast and a long one slowly, which is the price of the straight line.
  // At the default scale that is tile 2 over a 60s loop = 0.033/sec, near
  // enough to the hand-tuned 0.025*sqrt(2) that the look is preserved.
  //
  // vec2(1.0) -- not vec2(1.0, 0.0) -- because this drift was originally a
  // SCALAR added to a vec2 coordinate, i.e. a diagonal translation.
  // loopTravel takes its non-looping speed from |dir|, so dropping the
  // diagonal here would quietly slow the unlooped look down by 30%.
  vec2 drift = loopTravel(0.025, vec2(1.0), tile);

  // Advect the sample point along the curl field in 3 FIXED steps (written
  // out explicitly rather than a variable-length loop, which risks the
  // driver's "shader too complex" downsampling heuristic on some GPUs --
  // see BASE_UNIFORMS / project notes on avoiding uniform-array loops).
  // Each step nudges the point further along the local current, and it is
  // the NUMBER of steps that turns advection into rotation: one step is a
  // plain directional shove, and at two the point still travels an almost
  // straight chord. The third is where it curves enough to close visible
  // eddies, which is the whole point of the look. Step gain is dropped from
  // 0.08 to 0.055 to keep the total travel about where it was.
  //
  // The curl field is sampled at 0.55x the fbm's frequency, i.e. the
  // currents are deliberately LARGER than the colour masses they carry.
  // Sampled at the same frequency (as it was) each mass sat inside its own
  // little eddy, so the advection only roughened mass edges and the result
  // was indistinguishable from a plain warped fbm.
  vec2 advected = uv;
  advected += curl(advected * curlScale + u_seed + drift, tile) * u_drift * 0.055;
  advected += curl(advected * curlScale + u_seed + drift, tile) * u_drift * 0.055;
  advected += curl(advected * curlScale + u_seed + drift, tile) * u_drift * 0.055;

  float t = fbm2(advected * u_scale + u_seed);

  // Remap to [0,1]. NOT a plain t * 0.5 + 0.5: fbm2 is roughly Gaussian with
  // sd ~0.35, so a linear remap parks ~90% of the frame in the middle half of
  // the ramp. Measured on the linear version, the first palette colour took
  // 0.0% of the frame on bright-8 and jewel-6. See spread() in noise.ts.
  t = spread(t, 0.35); // 0.35 = fbm2's standard deviation

  // Openness: mixing toward t*t pulls low values further down (t*t < t for
  // t in (0,1)) while leaving values near 1 nearly untouched. Low t samples
  // the palette's first colour, so this widens that colour into the calm
  // negative space the look is built around, rather than dimming the whole
  // image uniformly. It has to come AFTER spread(): applied to the raw
  // Gaussian remap it was biasing an already centre-heavy distribution, which
  // is what put the washed-out midtone zones on dark-8.
  t = mix(t, t * t, u_openness);

  // No mirror-wrap: spread() already bounds t to [0,1], so the old
  // abs(fract(t*0.5)*2-1) reduced to a plain 1 - t. That silent reversal was
  // also what turned the openness bias above into a bias toward the palette's
  // LAST colour, which is how the first colour ended up at 0% of frame.
  //
  // No final smoothstep either: t is already uniformly distributed and there
  // is no wrap fold to soften, so an S-curve here would only widen the two
  // end colours at the expense of everything in between.
  vec3 color = palette(t);

  // Grain: cheap per-pixel dither, centered at 0 so it can darken or
  // lighten symmetrically instead of just brightening the whole frame.
  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const flow: ShaderDef = {
  id: "flow",
  label: "Flow",
  fragment: FRAGMENT,
  params: [
    { key: "scale", label: "Scale", min: 0.6, max: 2.6, step: 0.05, default: 1.7 },
    { key: "drift", label: "Drift", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "openness", label: "Openness", min: 0, max: 1, step: 0.01, default: 0.28 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    return {
      scale: 0.6 + rand() * (2.6 - 0.6),
      drift: rand() * 1,
      openness: rand() * 1,
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.08,
    };
  },
};
