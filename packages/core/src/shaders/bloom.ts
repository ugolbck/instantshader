// "Bloom" look: a fan of 4-8 huge, ultra-soft petals radiating from a single
// origin sitting at (or just below) the frame's bottom edge. The whole image
// is ONE analytic polar field -- no noise field, no fbm -- which is what
// gives it the airbrushed smoothness the references have:
//
//   t = r / (R * (e(theta) + eps)),   color = palette(t)
//
// where e(theta) = |cos(k*theta/2)|^pinch is a rose-curve envelope. That one
// formula produces every feature of the reference images at once:
//
//   - the PETALS are the envelope's lobes;
//   - the thin dark CREASES between petals are where cos pinches to ~0, so t
//     blows up and the background color pierces inward as tapering wedges;
//   - the scalloped inner "flower" shapes are the field's LEVEL SETS --
//     iso-lines of r/e are miniature copies of the petal silhouette, so the
//     palette reads as concentric scalloped bands from core to tips.
//
// The palette is laid out RADIALLY: first stop at the origin (the hot core),
// last stop as the background beyond the tips and inside the creases. eps is
// the crease floor: along a crease t = r/(R*eps) still grows with r, so
// creases grade through the same ramp -- light near the core, background
// further out -- instead of cutting a flat dark line all the way in.
//
// Against its siblings: flow = isotropic noise currents filling the frame,
// beam = one directional light streak on dark, bloom = the GEOMETRIC one --
// a radial composition whose shapes are analytic curves, not noise.
//
// Motion is two independent, blendable modes, because the owner wants to
// pick between them (or mix) by eye in the playground:
//   - u_sway: the SHAPES move -- per-petal length breathing (phase-offset
//     around the fan), a slow lean of the whole fan, a slow shear pulse;
//   - u_colorflow: the GEOMETRY holds still and the COLORS travel outward
//     through the pattern forever, via a ping-pong (triangle-wave) remap of
//     the radial palette coordinate, which is seam-free by construction.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, GRAIN } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_petals;
uniform float u_pinch;
uniform float u_bend;
uniform float u_sway;
uniform float u_colorflow;
uniform float u_grain;

${SIMPLEX_2D}
${GRAIN}

const float PI = 3.14159265;

// Triangle-wave ping-pong: period 2, range [0,1], IDENTITY on [0,1] when the
// phase is zero -- so colorflow=off renders the plain radial ramp, and any
// moving phase slides color bands through the pattern with no fract() seam
// anywhere (the wave reflects instead of jumping).
float tri(float x) {
  return 1.0 - abs(1.0 - 2.0 * fract(0.5 * x));
}

void main() {
  vec2 uv = worldUv();

  // Isotropic frame, same construction as beam: worldUv() is 0-1 on both
  // axes of a 16:9 world, so raw uv would render every petal 1.78x wider
  // than tall and the fan would smear sideways. Scaling x by the world
  // aspect makes a unit circle a screen circle; halfIso is the frame's
  // visible half-extents in that space (cover-fit aware), used to place the
  // origin against the actual frame edges at any canvas aspect.
  float worldAspect = 1000.0 / 562.5;
  float canvasAspect = u_resolution.x / u_resolution.y;
  vec2 iso = (uv - 0.5) * vec2(worldAspect, 1.0);
  vec2 halfIso = vec2(0.5 * min(1.0, canvasAspect / worldAspect),
                      0.5 * min(1.0, worldAspect / canvasAspect))
               * vec2(worldAspect, 1.0);

  // ---- per-instance composition, all derived from u_seed ----------------
  float seedRow = u_seed * 0.61 + 7.0;

  // Origin: anywhere along the bottom edge (references use bottom-left and
  // bottom-center), from slightly inside the frame (the hot core peeks in,
  // as in all three references) to a bit below it.
  float ox = snoise(vec2(seedRow, 1.3)) * 0.8 * halfIso.x;
  // At or just below the edge -- never inside: an origin inside the frame
  // shows petals radiating in every direction (a starburst), while the
  // references always crop the fan at its base.
  float oy = -halfIso.y * (1.02 + 0.11 * (1.0 + snoise(vec2(seedRow, 9.1))));
  vec2 origin = vec2(ox, oy);

  // Fan rotation. The rose envelope has k lobes evenly spaced around the
  // full circle, so any rotation leaves several pointing into the frame;
  // this just varies WHICH part of the fan the frame crops.
  float theta0 = snoise(vec2(seedRow, 5.2)) * PI;

  vec2 rel = iso - origin;
  float r = length(rel);
  float theta = atan(rel.y, rel.x);

  // ---- sway: the shapes move ---------------------------------------------
  // Lean: the whole fan pivots a few degrees around the origin. Shear pulse:
  // the bend term below oscillates, so petals flex along their length rather
  // than rotating rigidly. Both sinusoidal through loopFreq, so they are
  // exactly periodic when looping (and freeze, rather than speed up, when
  // the loop is too short for their tuned rates -- see loopFreq).
  // The sines alone are not enough: loopFreq freezes them at loops shorter
  // than ~half their period (its documented anti-throb choice), which left
  // sway with NO motion at all at 4-8s loops. wdrift is the non-freezing
  // half -- a loopDrift walk through the per-petal noise (below) and the
  // lean, exactly periodic at ANY loop length by construction, same as the
  // siblings' primary motion.
  vec2 wdrift = loopDrift(0.05 * u_sway, vec2(1.0, 0.0));
  float lean = u_sway * (0.06 * sin(loopFreq(0.21) * u_time + u_seed)
                       + 0.05 * snoise(vec2(seedRow * 0.47, 9.3) + wdrift));
  float shearPulse = u_sway * 0.08 * sin(loopFreq(0.15) * u_time + 2.3 + u_seed);

  // Bend: angular shear proportional to r curves each petal progressively
  // toward its tip -- the gentle bow the reference petals have -- instead of
  // rotating the fan rigidly.
  float th = theta - theta0 - lean + (u_bend + shearPulse) * r;

  // ---- rose-curve envelope ------------------------------------------------
  // k is snapped to an integer: |cos| has period pi, so integer k makes the
  // envelope exactly 2pi-periodic and the atan branch cut at theta = +-pi is
  // invisible. A fractional k would draw a hard radial seam there.
  float k = floor(u_petals + 0.5);
  float a = 0.5 * k * th;
  float e = pow(abs(cos(a)), u_pinch);

  // Per-petal identity: which lobe this pixel belongs to, expressed as the
  // lobe's center ANGLE and hashed through cos/sin so it is periodic around
  // the circle -- a raw lobe index would jump by k across the branch cut and
  // tear the per-petal variation along that ray. The discontinuity between
  // ADJACENT lobes is harmless: it sits exactly in the crease, where e ~ 0
  // pushes both sides to the background color anyway.
  float lobe = floor(a / PI + 0.5);
  float cAngle = theta0 + 2.0 * PI * lobe / k;
  float perLobe = 0.28 * snoise(vec2(cos(cAngle), sin(cAngle)) * 1.9
                              + vec2(seedRow * 0.13, seedRow * 0.29) + wdrift);

  // Breathing: each petal's length swells ~10%, phase-offset around the fan
  // by 2*cAngle (integer multiple of the angle, so it survives the branch
  // cut) -- the petals ripple in sequence instead of pulsing in lockstep.
  float breathe = u_sway * 0.10 * sin(loopFreq(0.32) * u_time + 2.0 * cAngle + u_seed * 0.7);
  float len = 1.0 + perLobe + breathe;

  // ---- the field ----------------------------------------------------------
  // eps = 0.075 is the crease floor (see header). R = 1.4 at scale 1 puts
  // the default tips just past the frame's top edge with the origin at the
  // bottom, matching the references' crop.
  float R = 1.4 * u_scale;
  float t = r / (R * len * (e + 0.075));

  // Radial shaping: pow < 1 compresses the ramp's early stops into a small
  // hot core at the origin and hands most of each petal's length to the
  // later stops -- in the references the petals are dominated by ONE body
  // color (the second-to-last stop) for ~70% of their length, with the core
  // colors confined to the base. Linear t spread the early stops across half
  // the petal and the body color only appeared at the rim.
  t = pow(t, 0.5);

  // ---- colorflow: the colors move ----------------------------------------
  // Phase in tri-units (period 2 = one full out-and-back palette cycle).
  // Not looping: linear crawl; the +37 base offset means the knob has a
  // visible effect even at t=0 (and 37 is deliberately not a multiple of the
  // period). Looping: exactly n cycles per loop, floored at ONE -- unlike
  // the sway sines, colorflow is a headline motion, and freezing it at
  // common loop lengths (loopFreq's choice) would read as the feature being
  // broken rather than as restraint. One cycle over a short loop is simply a
  // faster flow, which is what a short loop asks for.
  float pRate = 0.05 * u_colorflow;
  float p;
  if (u_loop <= 0.0) {
    p = pRate * (u_time + 37.0);
  } else {
    p = 2.0 * max(1.0, floor(pRate * u_loop * 0.5 + 0.5)) * (u_time / u_loop);
  }

  // The flow lives INSIDE the silhouette: the mask fades it out across the
  // tips so the background (t >= 1) stays pinned to the last stop and the
  // negative space never pulses. Gated on u_colorflow so 0 is exactly the
  // static field even while looping (where p above moves regardless).
  float flowMix = (1.0 - smoothstep(0.82, 1.0, t)) * smoothstep(0.0, 0.08, u_colorflow);
  float tc = mix(min(t, 1.0), tri(t - p), flowMix);

  vec3 color = palette(tc);

  // Grain: cheap per-pixel dither, centered at 0 so it can darken or
  // lighten symmetrically instead of just brightening the whole frame.
  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const bloom: ShaderDef = {
  id: "bloom",
  label: "Bloom",
  fragment: FRAGMENT,
  params: [
    // Petal length: tips at the frame's top edge around 1.0; below ~0.7 the
    // fan huddles at the bottom, above ~1.6 the frame lives inside the
    // petals' midsection.
    { key: "scale", label: "Scale", min: 0.5, max: 2, step: 0.05, default: 0.9 },
    { key: "petals", label: "Petals", min: 6, max: 16, step: 1, default: 11 },
    // Envelope exponent. LOW values give the reference look -- fat flat-top
    // petals with thin creases; high values slim the petals and widen the
    // dark wedges toward a star shape.
    { key: "pinch", label: "Pinch", min: 0.35, max: 2.5, step: 0.05, default: 0.6 },
    // Signed curvature (angular shear per unit radius): petals bow
    // clockwise or counter-clockwise along their length.
    { key: "bend", label: "Bend", min: -0.9, max: 0.9, step: 0.05, default: 0.25 },
    { key: "sway", label: "Sway", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "colorflow", label: "Color flow", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    return {
      scale: 0.7 + rand() * (1.6 - 0.7),
      // The references' lobe spacing is ~25-35 degrees, i.e. 10-14 over the
      // full circle (only the upward half is ever in frame). floor yields
      // the integers 8..14.
      petals: Math.floor(8 + rand() * 7),
      pinch: 0.5 + rand() * (1.6 - 0.5),
      bend: -0.6 + rand() * 1.2,
      sway: 0.2 + rand() * (0.9 - 0.2),
      colorflow: rand() * 0.8,
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.08,
    };
  },
};
