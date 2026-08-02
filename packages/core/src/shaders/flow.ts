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
import { SIMPLEX_2D, FBM, SHAPE, GRAIN } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_drift;
uniform float u_openness;
uniform float u_grain;

${SIMPLEX_2D}
${FBM}
${SHAPE}
${GRAIN}

// Curl of a scalar simplex field: the finite-difference gradient of snoise,
// rotated 90 degrees -- (dPsi/dy, -dPsi/dx) instead of (dPsi/dx, dPsi/dy).
// A rotated gradient is always divergence-free, which is the whole trick:
// advecting a point along it produces swirling motion with nothing to make
// it converge or diverge, unlike advecting along the gradient itself.
vec2 curl(vec2 p) {
  // Finite-difference step: small enough to approximate a derivative,
  // large enough that snoise's own float precision doesn't swamp the
  // difference between the two samples.
  float eps = 0.05;
  float dx = (snoise(p + vec2(eps, 0.0)) - snoise(p - vec2(eps, 0.0))) / (2.0 * eps);
  float dy = (snoise(p + vec2(0.0, eps)) - snoise(p - vec2(0.0, eps))) / (2.0 * eps);
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
  float drift = u_time * 0.025;

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
  float curlScale = u_scale * 0.55;
  vec2 advected = uv;
  advected += curl(advected * curlScale + u_seed + drift) * u_drift * 0.055;
  advected += curl(advected * curlScale + u_seed + drift) * u_drift * 0.055;
  advected += curl(advected * curlScale + u_seed + drift) * u_drift * 0.055;

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
