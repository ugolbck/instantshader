// "Strata" look: a stack of cut-paper sheets, each one a palette stop, each
// cut along a different shoreline of the same landscape and casting a soft
// shadow on the sheet below. Layered papercut / topographic relief.
//
// SPEC
//
// 1. QUANTISED HEIGHTFIELD. One scalar field n(p) in [0,1] -- 2-octave
//    simplex fbm under a shared domain warp, flattened to a UNIFORM
//    distribution by spread(). v = n * L; band = floor(v) is which sheet the
//    pixel lies on, f = fract(v) how far it is toward the next sheet's edge.
//    Uniformity is load-bearing here, not cosmetic: it is what gives every
//    sheet the same visible area, so an 8-layer stack shows 8 layers instead
//    of 4 fat middles and 4 slivers.
//
// 2. THE SHEETS ARE ISO-BANDS, THE EDGES ARE ISO-LINES. Because all sheets
//    are level sets of one smooth field they nest like contour lines: edges
//    never cross, and each silhouette is a slightly inflated echo of the one
//    above it -- the defining trait of real layered papercraft.
//
// 3. SHADOWS BY HEIGHT-COMPARE, NOT BLUR. For each pixel the field is
//    re-sampled one shadow-length toward the light. If that sample sits on a
//    higher sheet (v2 >= band + 1), something taller stands between this
//    pixel and the light. smoothstep on v2 turns the binary test into a
//    penumbra whose darkest point hugs the casting edge. This is a one-tap
//    horizon-shadow (the same test a heightfield ray-march makes on its first
//    step) -- there is no second pass and no kernel.
//    A second, shorter tap toward the light finds the LIT edge of each sheet
//    (sample lower than own band) and lifts it with a screen-blended rim:
//    the visible paper thickness.
//
// 4. ANALYTIC EDGE ANTI-ALIASING. WebGL1 without OES_standard_derivatives
//    has no fwidth(), so the field's screen-space gradient is rebuilt from
//    the taps already taken (along-light, plus one perpendicular), converted
//    to "v per pixel", and the band colour is blended to the next band over
//    exactly that width. Edges stay one pixel soft at any resolution, from a
//    128px tile to a 4K export.
//
// 5. u_blend: FLAT <-> GRADIENT. Ramp position is mix(band/(L-1), v/L, blend).
//    At 0 each sheet is one flat stop (pure papercut, the palette quantised
//    to L tones). Toward 1 every sheet carries its own gradient and the
//    steps in COLOUR vanish, leaving a continuous gradient that is terraced
//    only by light and shadow.
//
// 6. THE RELIEF ITSELF IS TUNABLE, not just how it is lit. Two controls
//    change the landscape's character rather than its dressing:
//      - u_ridges cross-fades the fbm toward its own RIDGED transform
//        (a - b*|n|): the zero-crossings of the noise become crests, so round
//        islands turn into branching mountain spines and crater rims;
//      - u_stretch samples the field anisotropically along a seeded axis, so
//        blobs draw out into long flowing terraces -- agate bands, wind-cut
//        canyon strata.
//    And the seed is HASHED into the noise plane (seedOffset) instead of
//    added to it, so a new seed is a new landscape, not the old one panned.
//
// 7. MOTION. The field drifts through loopDrift, and because edges are
//    level sets, a drifting field does not slide the image -- it makes every
//    shoreline advance and retreat independently: islands surface, bays
//    close, sheets merge.
//
// Against its siblings: the only look with HARD EDGES and discrete colour.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, FBM, SHAPE, GRAIN, ISO, SEED } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_layers;
uniform float u_warp;
uniform float u_ridges;
uniform float u_stretch;
uniform float u_depth;
uniform float u_blend;
uniform float u_angle;
uniform float u_grain;

${SIMPLEX_2D}
${FBM}
${SHAPE}
${GRAIN}
${ISO}
${SEED}

const float PI = 3.14159265;

float field(vec2 q) {
  float n = fbm2(q);
  // Ridged transform of the SAME sample (free): constants chosen so its mean
  // and spread roughly match the fbm's, keeping spread()'s equal-area promise
  // approximately true at any mix.
  float ridge = 0.55 - 1.6 * abs(n);
  return spread(mix(n, ridge, u_ridges), 0.35); // 0.35 = fbm2's standard deviation
}

// Frame-space vector -> field-space vector: rotate onto the seeded stretch
// axis, then compress along it. Used for positions AND for the tap offsets,
// so shadows keep their true on-screen length however stretched the field is.
vec2 toField(vec2 v, vec2 axis) {
  return vec2(dot(v, axis) / (1.0 + 3.0 * u_stretch), dot(v, vec2(-axis.y, axis.x)));
}

void main() {
  vec2 uv = worldUv();
  vec2 iso = isoCoord(uv);

  vec2 drift = loopDrift(0.03, vec2(1.0, 0.0));
  float freq = 0.8 * u_scale;

  // Domain warp, evaluated ONCE and shared by every tap below. The taps are
  // at most ~0.07 frame units apart, over which a 0.5x-frequency warp is
  // effectively constant -- re-evaluating it per tap would cost 6 more
  // snoise calls to move each tap by a fraction of a pixel.
  float axisAngle = seedHash(5.0) * PI;
  vec2 axis = vec2(cos(axisAngle), sin(axisAngle));
  vec2 fp = toField(iso, axis);
  vec2 so = seedOffset();
  vec2 wq = fp * (0.5 * u_scale) + so.yx + 40.0 - drift.yx;
  vec2 warp = u_warp * 0.45 * vec2(snoise(wq), snoise(wq + vec2(13.1, 7.7)));
  vec2 q = fp * freq + so + drift + warp;

  float L = floor(u_layers + 0.5);

  // Direction TOWARD the light, and the shadow length in frame units.
  float ang = u_angle * PI / 180.0;
  vec2 toLight = vec2(cos(ang), sin(ang));
  vec2 side = vec2(-toLight.y, toLight.x);
  float reach = 0.012 + 0.06 * u_depth;
  vec2 qLight = toField(toLight * reach, axis) * freq;
  vec2 qSide = toField(side * reach, axis) * freq;

  float v      = field(q) * L;
  float vFar   = field(q + qLight) * L;        // shadow tap
  float vNear  = field(q + qLight * 0.3) * L;  // rim tap
  float vSide  = field(q + qSide) * L;           // gradient only

  float band = min(floor(v), L - 1.0);
  float f = v - band;

  // ---- analytic edge AA ---------------------------------------------------
  // |grad v| per frame unit, from the two orthogonal taps, times the size of
  // a pixel in frame units (frame height is 2*isoHalf().y over resolution.y).
  float gradV = length(vec2(vFar - v, vSide - v)) / reach;
  float pixel = 2.0 * isoHalf().y / u_resolution.y;
  float aa = clamp(gradV * pixel * 1.5, 0.002, 0.5);
  float toNext = smoothstep(1.0 - aa, 1.0, f) * step(band, L - 1.5);

  // ---- colour -------------------------------------------------------------
  float denom = max(L - 1.0, 1.0);
  float tHere = mix(band / denom, v / L, u_blend);
  float tNext = mix((band + 1.0) / denom, v / L, u_blend);
  vec3 color = mix(palette(tHere), palette(tNext), toNext);

  // ---- shadow + rim -------------------------------------------------------
  // Both fade out across the AA band so the shadow ends exactly where the
  // upper sheet begins instead of printing a dark fringe onto its edge.
  float shadow = smoothstep(band + 0.85, band + 1.4, vFar) * (1.0 - toNext);
  color *= 1.0 - shadow * 0.6 * u_depth;

  float rim = smoothstep(band, band - 0.45, vNear) * step(0.5, band);
  color += (vec3(1.0) - clamp(color, 0.0, 1.0)) * rim * 0.22 * u_depth;

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const strata: ShaderDef = {
  id: "strata",
  label: "Strata",
  fragment: FRAGMENT,
  params: [
    { key: "scale", label: "Scale", min: 0.4, max: 2.5, step: 0.05, default: 1 },
    // Number of paper sheets. Independent of the palette size: the ramp is
    // resampled at L evenly spaced positions.
    { key: "layers", label: "Layers", min: 3, max: 16, step: 1, default: 7 },
    // Domain warp on the landscape: 0 gives round noise islands, 1 gives
    // stretched, liquid, marbled shorelines.
    { key: "warp", label: "Warp", min: 0, max: 1, step: 0.01, default: 0.5 },
    // 0 = round islands; 1 = branching mountain spines and crater rims.
    { key: "ridges", label: "Ridges", min: 0, max: 1, step: 0.01, default: 0.25 },
    // Draws the relief out along a (seeded) axis: blobs -> long agate bands.
    { key: "stretch", label: "Stretch", min: 0, max: 1, step: 0.01, default: 0.2 },
    // Shadow length AND darkness (plus the lit rim). 0 is flat posterisation.
    { key: "depth", label: "Depth", min: 0, max: 1, step: 0.01, default: 0.6 },
    // 0 = each sheet one flat colour; 1 = continuous gradient terraced only
    // by light.
    { key: "blend", label: "Blend", min: 0, max: 1, step: 0.01, default: 0.15 },
    // Where the light comes from.
    { key: "angle", label: "Light", min: 0, max: 360, step: 1, default: 125 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  ],
  randomParams(rand) {
    return {
      scale: 0.6 + rand() * (1.8 - 0.6),
      layers: Math.floor(4 + rand() * 9),
      warp: rand() * 1,
      ridges: rand() * 1,
      stretch: rand() * rand(),
      // Never flat: without shadows this is a posterise filter, not paper.
      depth: 0.35 + rand() * (1 - 0.35),
      blend: rand() * 0.6,
      angle: Math.floor(rand() * 360),
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.06,
    };
  },
};
