// "Halo" look: a total eclipse. One black disc, back-lit; a razor-bright limb
// where the light grazes its edge, and a corona of streamers bleeding out
// into the dark. The palette wraps AROUND the ring and slowly orbits it.
//
// SPEC
//
// 1. ONE SDF DRIVES EVERYTHING. d = |p - c| - R, the signed distance to the
//    disc. Every radiance term is a 1D falloff in d:
//      - limb:    exp(-|d| / 0.007)      hairline, both sides of the edge
//      - corona:  exp(-d / len)          d > 0, the main glow
//      - veil:    exp(-d / (3.5 * len))  d > 0, wide faint atmosphere
//      - inner:   exp( d / lenIn)        d < 0, light wrapping onto the disc
//    Exponentials (not Gaussians) on purpose: scattered light falls off with
//    a long tail, and the long tail is what makes the dark read as DEEP
//    rather than as a flat backdrop the ring was pasted on.
//
// 2. STREAMERS IN LOG-POLAR SPACE. The corona's reach `len` is modulated per
//    direction by two octaves of PERIODIC Perlin noise sampled at
//    (theta * A / TAU, log(r / R)). Log-radius makes features self-similar --
//    they widen as they travel outward, as real streamers do -- and the
//    explicit period A on the angular axis makes the field exactly continuous
//    across atan()'s branch cut at +-pi, which no simplex lookup can promise.
//    Modulating the falloff LENGTH rather than the brightness is what turns
//    noise into rays: a bright patch would be a blob; a locally longer
//    falloff is a spike.
//
// 3. PALETTE BY AZIMUTH. t = 0.5 + 0.5 * cos(theta - theta0): the ramp runs
//    first -> last -> first around the ring, so an open-ended (non-cyclic)
//    palette still closes with no seam. Streamers perturb theta so colour
//    boundaries feather along the rays, and a small radial term pushes the
//    outer corona further along the ramp than the limb beneath it.
//
// 4. CRESCENT. Radiance is weighted by pow(0.5 + 0.5*cos(theta - thetaL), 3),
//    mixed in by u_crescent: 0 is a full annular ring, 1 is a single lit arc
//    -- a planet's limb at sunrise -- with the far side falling to black.
//
// 5. EXPLICIT PLACEMENT. u_x / u_y position the disc, in units of
//    (frame half-extent + radius) -- so 0 is centred and +-1 is ALWAYS "the
//    limb just touches that frame edge from outside", whatever the radius.
//    A big radius at y ~ -0.8 is the "horizon from orbit" hero composition:
//    one shallow luminous arc across the bottom of the frame. The crescent's
//    light then comes from the frame centre's side automatically, so the lit
//    arc is the one in view; only a centred disc takes its light direction
//    from the seed.
//
// 6. ADDITIVE ON A PALETTE-TINTED DARK. Same emission model as beam: the
//    background is the ramp's darkest stop crushed toward black, light is
//    ADDED, and a luma-compensating gain keeps pastel banks from clipping
//    while a chroma boost keeps near-black banks visible.
//
// 7. MOTION. The palette orbits the ring (theta0 via loopAngle); streamers
//    flow OUTWARD forever (straight-line loopTravel along the log-radius
//    axis of the tiling noise, so it loops without ever reversing); the
//    crescent's light direction sways on a loopDrift path.
//
// Against its siblings: beam is a streak, bloom a fan; halo is the OBJECT --
// the only look with a solid silhouette at its centre.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, PERIODIC_2D, GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_radius;
uniform float u_x;
uniform float u_y;
uniform float u_glow;
uniform float u_crescent;
uniform float u_flares;
uniform float u_grain;

${SIMPLEX_2D}
${PERIODIC_2D}
${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const float PI = 3.14159265;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();

  vec2 so = seedOffset();
  vec2 drift = loopDrift(0.04, vec2(1.0, 0.0));

  // ---- the disc -----------------------------------------------------------
  float R = u_radius;
  vec2 c = vec2(u_x, u_y) * (halfIso + R);

  vec2 rel = p - c;
  float r = length(rel);
  float theta = atan(rel.y, rel.x);
  float d = r - R;

  // ---- streamers ----------------------------------------------------------
  // A = 14 angular periods; radial tile 4. The second octave doubles both
  // the frequency and the tile, and travels twice as far per loop, so it
  // lands on a whole tile too.
  float A = 14.0;
  // 0.7: radial features ~6x longer than they are wide at A = 14, which is
  // the anisotropy that reads as RAYS. At 2.2 the cells were near-square in
  // log-polar space and the corona rendered as cloud.
  float rho = log(max(r, 0.001) / R) * 0.7;
  float flowOut = loopTravel(0.04, vec2(0.0, 1.0), 4.0).y;
  vec2 sp = vec2((theta / TAU + 0.5) * A, rho - flowOut + so.x);
  float fl = pnoise(sp, vec2(A, 4.0)) + 0.5 * pnoise(sp * 2.0, vec2(2.0 * A, 8.0));

  float len = (0.03 + 0.3 * u_glow) * max(1.0 + 1.5 * u_flares * fl, 0.15);
  float outside = max(d, 0.0);
  float corona = exp(-outside / len);
  float veil = 0.18 * exp(-outside / (3.5 * len));
  float inner = 0.4 * exp(min(d, 0.0) / (0.025 + 0.09 * u_glow));
  float limb = exp(-abs(d) / 0.007);

  // One-pixel soft disc edge, in frame units.
  float pixel = 2.0 * halfIso.y / u_resolution.y;
  float isOut = smoothstep(-pixel, pixel, d);

  // ---- crescent -----------------------------------------------------------
  // Light direction as a VECTOR blend (no angle wrap to worry about): the
  // seeded direction for a centred disc, handing over to "toward the frame
  // centre" as the disc moves off it, plus a slow sway.
  float aSeed = seedHash(1.0) * TAU;
  float off = length(c);
  float sway = 0.35 * snoise(vec2(so.y, 1.0) + drift);
  vec2 inward = -c / max(off, 0.0001);
  inward = vec2(inward.x * cos(sway) - inward.y * sin(sway),
                inward.x * sin(sway) + inward.y * cos(sway));
  vec2 seedDir = vec2(cos(aSeed + sway), sin(aSeed + sway));
  vec2 dirL = normalize(mix(seedDir, inward, smoothstep(0.05, 0.5, off)) + seedDir * 0.0001);
  float facing = 0.5 + 0.5 * dot(rel / max(r, 0.0001), dirL);
  float arc = mix(1.0, 0.03 + 0.97 * facing * facing * facing, u_crescent);

  // ---- palette by azimuth -------------------------------------------------
  float theta0 = loopAngle(0.1) + seedHash(2.0) * TAU;
  float tA = 0.5 + 0.5 * cos(theta - theta0 + 0.7 * u_flares * fl);
  float t = clamp(tA * 0.85 + 0.15 * (1.0 - exp(-outside * 3.0)), 0.0, 1.0);
  vec3 col = palette(t);
  float lum = dot(col, LUMA);

  // ---- background: the ramp's darkest stop, crushed (as in beam) ----------
  vec3 cA = palette(0.0);
  vec3 cB = palette(0.5);
  vec3 cC = palette(1.0);
  float lA = dot(cA, LUMA);
  float lB = dot(cB, LUMA);
  float lC = dot(cC, LUMA);
  vec3 dk = mix(cA, cB, step(lB, lA));
  dk = mix(dk, cC, step(lC, min(lA, lB)));
  vec3 color = dk * 0.1;

  // ---- additive light -----------------------------------------------------
  // gain/boost: see beam.ts -- bright banks are divided down before they can
  // clip, dark banks are multiplied up (chroma-preserving) before they vanish.
  float gain = 1.0 / (1.0 + 1.2 * lum * lum);
  float boost = 1.0 + 2.0 * (1.0 - lum) * (1.0 - lum) * (1.0 - lum);
  float radiance = mix(inner, corona + veil, isOut);
  color += col * radiance * arc * gain * boost * 1.35;
  // The limb is the hottest thing in frame: palette colour plus a dark-gated
  // white lift, so it still reads as a filament on near-black banks.
  color += (col * 0.8 + vec3(0.35 * (1.0 - lum))) * limb * arc;

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const halo: ShaderDef = {
  id: "halo",
  label: "Halo",
  fragment: FRAGMENT,
  params: [
    // Disc radius in frame heights. Past ~0.6 the disc no longer fits and the
    // frame shows a single sweeping arc of it.
    { key: "radius", label: "Radius", min: 0.12, max: 1.6, step: 0.01, default: 1 },
    // Disc position. 0 = centred; +-1 = the limb just touches that frame
    // edge from outside (at any radius). The default is the horizon hero.
    { key: "x", label: "X", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "y", label: "Y", min: -1, max: 1, step: 0.01, default: -0.78 },
    // Corona reach.
    { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, default: 0.5 },
    // 0 = full ring; 1 = a single lit arc.
    { key: "crescent", label: "Crescent", min: 0, max: 1, step: 0.01, default: 0.35 },
    // Streamer strength: 0 is a perfectly smooth glow, 1 is a spiky solar
    // corona.
    { key: "flares", label: "Flares", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    // Two compositions, not one smear between them: a half-hidden mid-size
    // disc is the least interesting frame this look can make.
    const horizon = rand() < 0.6;
    return {
      radius: horizon ? 0.7 + rand() * (1.5 - 0.7) : 0.18 + rand() * (0.42 - 0.18),
      x: horizon ? -0.3 + rand() * 0.6 : -0.4 + rand() * 0.8,
      y: horizon ? -0.86 + rand() * 0.16 : -0.2 + rand() * 0.4,
      glow: 0.3 + rand() * (0.9 - 0.3),
      crescent: rand() * 0.9,
      flares: 0.2 + rand() * (0.9 - 0.2),
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.08,
    };
  },
};
