// "Beam" look (id/label renamed from the interim "marble"): ONE luminous beam of soft light crossing a near-black
// frame -- a wide aurora/searchlight streak with a saturated core that walks
// the whole palette along its length, soft diffuse falloff across it, and
// thin brighter filaments crawling inside. Most of the frame is dark
// negative space; the beam is the entire composition.
//
// This replaces the diffuse radial-lobes version, whose verdict was "messy,
// blurry, can't identify a clear shape or nice flowing movement". That
// version had no silhouette by design (soft masses everywhere), and with
// nothing dark to contrast against, "soft" collapsed into "blurry". The fix
// is structural, not parametric: the new look keeps the softness but hangs
// it on ONE readable directional shape against a frame that is mostly black,
// so the eye always knows exactly where the light runs.
//
// Structure of the rewrite:
//
// 1. THE COMPOSITION IS A SINGLE CURVED BEAM, NOT A FIELD. Everything is
//    expressed in the beam's own frame: `s` runs along it, `q` across it.
//    The centerline is q = c(s), one low-frequency snoise bend -- a single
//    octave on purpose, because one octave cannot wobble; it gives the "one
//    gentle S" the references have, where a second octave immediately reads
//    as a squiggle.
//
// 2. THE PALETTE IS LAID OUT ALONG THE BEAM. t is the normalized along-beam
//    coordinate, so the ramp reads as a SEQUENCE travelling the beam's
//    length -- every stop is present, in order, with soft cross-blending
//    where neighbouring stops meet. (The old version traversed the ramp
//    radially and relied on an area-CDF to guarantee coverage; here the
//    beam's visible length simply IS the ramp, corner to corner.)
//
// 3. THE BACKGROUND STILL BELONGS TO THE PALETTE. It is the palette's
//    darkest stop crushed ~88% toward black, not literal #000 -- so a warm
//    bank leaves a faintly warm dark and a cool bank a faintly cool one,
//    and the beam never looks composited onto a foreign backdrop.
//
// Against its sibling: flow = isotropic swirls filling the frame, beam =
// SOFT DIRECTIONAL LIGHT ON DARK -- the only look built on negative space, and the only one where the
// palette reads as a left-to-right sequence along a single shape.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, GRAIN } from "./noise";

const FRAGMENT = `
uniform float u_scale;
uniform float u_width;
uniform float u_glow;
uniform float u_angle;
uniform float u_grain;

${SIMPLEX_2D}
${GRAIN}

const float PI = 3.14159265;

// Rec.709 luma weights -- used both to find the palette's darkest stop for
// the background and to attenuate the white core-lift on bright palettes.
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec2 uv = worldUv();

  // ---- isotropic beam frame ---------------------------------------------
  // worldUv() is 0-1 on BOTH axes of a 1000x562.5 world, so one uv unit of x
  // is 1.78x more screen distance than one of y. flow/ribbons can ignore
  // that (noise fields and full-frame sweeps don't care), but a BEAM cannot:
  // sampled in raw uv, a vertical beam renders 1.78x thinner than a
  // horizontal one at the same u_width, and the angle param would double as
  // a hidden thickness control. Scaling x by the world aspect makes the
  // space isotropic -- a unit circle is a screen circle -- so thickness is
  // angle-independent. halfIso mirrors worldUv()'s cover fit in the same
  // space, so the frame's visible half-extents stay correct for a square
  // preview tile and a 16:9 export alike.
  float worldAspect = 1000.0 / 562.5;
  float canvasAspect = u_resolution.x / u_resolution.y;
  vec2 iso = (uv - 0.5) * vec2(worldAspect, 1.0);
  vec2 halfIso = vec2(0.5 * min(1.0, canvasAspect / worldAspect),
                      0.5 * min(1.0, worldAspect / canvasAspect))
               * vec2(worldAspect, 1.0);

  float ang = u_angle * PI / 180.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 perp = vec2(-dir.y, dir.x);

  // Projections of the frame's corner onto the beam axes: the largest |s|
  // and |q| the visible frame can produce. halfSpan pins the palette ramp to
  // the beam's visible length (below); crossHalf scales the seed's
  // perpendicular placement so "55% toward an edge" means the same thing at
  // every angle and aspect.
  float halfSpan  = halfIso.x * abs(dir.x)  + halfIso.y * abs(dir.y);
  float crossHalf = halfIso.x * abs(perp.x) + halfIso.y * abs(perp.y);

  float s = dot(iso, dir);  // along the beam
  float q = dot(iso, perp); // across the beam
  float sn = s / halfSpan;  // -1..1 over the beam's visible length

  // ---- per-instance composition, all derived from u_seed ----------------
  // seedRow picks which horizontal SLICE of the 2D noise field this
  // instance's bend lives on: different seeds get
  // genuinely different curves, not the same curve translated. u_seed is
  // pre-modded to [0,100), so seedRow stays well inside snoise's precision
  // range.
  float seedRow = u_seed * 0.37 + 11.0;

  // Same slow crawl rate as the siblings. It slides the bend's sample window
  // along the noise slice, so the whole beam sways -- the S migrates -- with
  // no other motion source needed for the silhouette.
  float drift = u_time * 0.02;

  // Where the beam sits across the frame. One static seed term (placement)
  // plus the animated bend. Placement is held to 50% of crossHalf so the
  // beam never starts life hugging an edge; the bend adds up to ~45% more
  // locally, and the clamp stops the sum at 75% so the worst seed still
  // keeps the core inside the frame instead of showing only its halo.
  float off0 = snoise(vec2(seedRow, 3.7));
  float bend = snoise(vec2(sn * (0.55 * u_scale) + drift, seedRow));
  float c = crossHalf * clamp(0.5 * off0 + 0.45 * bend, -0.75, 0.75);

  // Breathing: the width swells ~10% over a ~57s cycle, phase-shifted along
  // the beam (the sn * 2.0 term) so it travels as a slow peristaltic wave
  // rather than the whole beam pulsing in lockstep, which read as a strobe
  // precursor even at this amplitude.
  float w = u_width * (1.0 + 0.10 * sin(u_time * 0.11 + sn * 2.0 + u_seed));

  // Signed cross distance in units of the beam's own width. Everything
  // profile-shaped below is a function of this one number.
  float nd = (q - c) / w;
  float nd2 = nd * nd;

  // ---- the two profiles --------------------------------------------------
  // core: exp(-nd^4). A plain Gaussian (exp(-nd^2)) was tried first and is
  // exactly the old shader's mistake in one dimension -- its long tails mean
  // the "edge" is a 2-width-wide smear and the silhouette dissolves. The
  // quartic exponent gives a flat luminous top and a falloff that is soft
  // but FAST (0.22 at one width, 0.01 at 1.3 widths), which is what makes
  // the streak readable as a shape while still having no hard line anywhere.
  float core = exp(-nd2 * nd2 * 1.5);
  // halo: a wide true Gaussian, ~3x the core's width, carrying the "light
  // leak" atmosphere into the dark. This one WANTS long tails -- it is the
  // diffuse spill, and u_glow scales it (below) rather than the core, so
  // the glow slider changes how far the light bleeds without ever blurring
  // the silhouette itself.
  float halo = exp(-nd2 * 0.28);

  // ---- palette along the beam --------------------------------------------
  // sn is -1..1 over the visible length, so this sweeps the whole ramp
  // corner to corner. The 1.05 overdrive tucks the exact ramp ends a hair
  // outside the frame; palette() clamps, so the first and last stops each
  // hold a short solid run at the beam's ends instead of appearing only in
  // the final pixel row.
  float t = clamp(sn * 1.05 * 0.5 + 0.5, 0.0, 1.0);

  // ---- internal filaments ------------------------------------------------
  // One noise field does both filament jobs. Its anisotropy is the point:
  // high frequency ACROSS the beam (nd * 2.6), low frequency ALONG it
  // (0.9 * u_scale over a 2-unit sn range), so its iso-lines are long
  // streaks running WITH the beam that wander slowly -- hair-thin light
  // strands, not speckle. The crawl term slides the field along s at ~2.5x
  // the sway rate, giving the "light travelling down the beam" motion the
  // brief asks for while the silhouette itself barely moves.
  // Sampled in ABSOLUTE cross-distance (q - c), not width-relative nd: in nd
  // units the field gets magnified with the beam, and past width ~0.25 its
  // ridge lines blew up into jagged chevron kinks. Absolute sampling keeps
  // strands hair-thin at every width (26.0 = the old 2.6/nd density at the
  // original 0.1 default, preserving the approved look there).
  float crawl = u_time * 0.05;
  float fil = snoise(vec2(sn * (0.9 * u_scale) - crawl, (q - c) * 26.0 + seedRow * 1.7));

  // Holographic banding: the same field nudges the ramp position inside the
  // core, so colour bands streak lengthwise through the beam (the foil-like
  // internal banding of the second reference). 0.05 is about half a stop's
  // width on an 8-colour bank -- enough to see, never enough to reorder the
  // sequence. Masked by core so the banding cannot tint the background.
  t = clamp(t + 0.05 * fil * core, 0.0, 1.0);

  // Bright filament lines: the ridge transform (1 - |noise|) peaks where the
  // field crosses zero, i.e. along thin wandering lines. The 0.78 threshold
  // keeps only the top ~10% of the ridge, which at this anisotropy yields
  // 2-3 visible strands inside the core.
  //
  // The wideFade term keeps the extended width range clean: with absolute
  // cross-sampling a wide beam fits MANY strands, which reads busy right
  // when the "wall of light" settings want a pure soft field. Fading the
  // lines out over the top half of the width range hands the wide beam to
  // the halo + grain alone.
  float wideFade = 1.0 - smoothstep(0.25, 0.5, u_width);
  float filLine = smoothstep(0.78, 0.97, 1.0 - abs(fil)) * wideFade;

  // ---- background: the palette's darkest stop, crushed --------------------
  // Sample three fixed ramp positions and keep the darkest (branchless --
  // step/mix, no if-ladder). Three samples is enough: palette() is an OKLCh
  // ramp, so the darkest point of the whole ramp is always at or near a
  // stop, and ends+middle bracket every bank in the lab set. The 0.12
  // multiplier is the "mixed ~88% toward black" from the art direction:
  // dark enough that even cream-4's darkest stop reads as near-black, light
  // enough that the tint survives (measured ~RGB 20-30 on mid banks).
  vec3 cA = palette(0.0);
  vec3 cB = palette(0.5);
  vec3 cC = palette(1.0);
  float lA = dot(cA, LUMA);
  float lB = dot(cB, LUMA);
  float lC = dot(cC, LUMA);
  vec3 dk = mix(cA, cB, step(lB, lA));
  float ld = min(lA, lB);
  dk = mix(dk, cC, step(lC, ld));
  vec3 bg = dk * 0.12;

  // ---- compositing: additive light on the dark ----------------------------
  // Everything below ADDS light to bg, never mixes toward it -- on a dark
  // ground, additive is what makes the beam read as emission rather than as
  // a painted stripe.
  vec3 beamCol = palette(t);
  float blum = dot(beamCol, LUMA);

  // Luma-compensating gain on the whole beam stack. The stack below sums to
  // ~1.65x beamCol at the centerline; on a bright bank (pastel-5, cream-4,
  // whose stops sit near luma 0.9) that clipped every channel and the entire
  // beam collapsed into one featureless white band -- the palette sequence,
  // the filaments and the silhouette's soft edge all vanished into the
  // clamp. Dividing by 1 + 1.2*luma^2 caps the bright banks' centerline
  // near 0.95 (hues survive, edge survives) while the quadratic leaves dark
  // banks -- which NEED the full additive energy to register at all --
  // almost untouched.
  float gain = 1.0 / (1.0 + 1.2 * blum * blum);

  vec3 color = bg;

  // Halo first (widest, dimmest). The 0.10 floor keeps a trace of spill even
  // at glow 0 so the beam never looks laser-cut out of the dark; u_glow
  // scales the rest, which is the slider's entire visible job.
  color += beamCol * halo * (0.10 + 0.40 * u_glow) * gain;

  // The core -- the beam's body. The chroma boost is the dark-bank mirror of
  // gain: multiplying a dark stop up (rather than adding white to it)
  // scales all three channels together, so dark-8's muted violets and blues
  // brighten WITHOUT greying out -- the first pass leaned on the white lift
  // alone and the whole beam read as monochrome silver on the dark banks.
  // Cubic in (1 - luma) so it is ~1.0 for any mid-or-brighter bank and only
  // really wakes up below luma ~0.3, where there is guaranteed headroom.
  float boost = 1.0 + 2.0 * (1.0 - blum) * (1.0 - blum) * (1.0 - blum);
  color += beamCol * core * gain * boost;

  // A hot centerline: core^2 halves the effective width, so this reads as
  // the brightest inner lane of the beam. Palette-coloured, not white,
  // because a white hotline desaturated the saturated banks (neon-5) into
  // pastel -- same failure the old shader documented for its bloom.
  color += beamCol * core * core * 0.35 * gain;

  // The one white term, and it is gated hard: (1 - luma)^2 means it only
  // registers where the palette itself is dark. This is the floor for
  // near-black-3, whose stops are so dark that even the chroma boost above
  // cannot lift them to visibility (3x of luma 0.03 is still 0.09) -- some
  // achromatic light is the only thing that can separate that bank's beam
  // from its own backdrop. Kept smaller than the boost's contribution so it
  // supplements the colour instead of silvering it, and quadratic (not
  // linear) falloff, quadratic because linear still
  // chalked the pastels.
  color += vec3((1.0 - blum) * (1.0 - blum) * core * core * (0.08 + 0.16 * u_glow));

  // Filaments ride on top, inside the core only. Mostly beam-coloured with
  // a small dark-gated white lift so they also survive the near-black banks.
  color += (beamCol * 0.6 + vec3(0.4 * (1.0 - blum))) * filLine * core * 0.45;

  // No secondary echo streak: an earlier version had one, and the owner read
  // it as a second competing pattern -- ONE beam is the composition, full
  // stop. The negative space it left behind is carried by grain alone.

  // Grain: cheap per-pixel dither, centered at 0 so it can darken or lighten
  // symmetrically. It matters more here than in any sibling: the dark field
  // is most of the frame, and grain is the only thing giving it surface --
  // without it the negative space reads as dead #000 flatness instead of
  // atmosphere.
  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const beam: ShaderDef = {
  id: "beam",
  label: "Beam",
  fragment: FRAGMENT,
  params: [
    { key: "scale", label: "Scale", min: 0.5, max: 2, step: 0.05, default: 1 },
    // Width is in iso-uv units where the frame's half-height is 0.5, so the
    // default core (plus halo) occupies roughly a third of the frame. The max
    // was originally 0.22 to protect the negative space, but the owner wants
    // the beam to be able to go MUCH wider -- at 0.6 the core spans more than
    // the frame's height and the look shifts from "streak" to "wall of
    // light", which is a legitimate epic setting, so the slider allows it.
    { key: "width", label: "Width", min: 0.04, max: 0.6, step: 0.005, default: 0.14 },
    { key: "glow", label: "Glow", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "angle", label: "Angle", min: 0, max: 360, step: 1, default: 28 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.08 },
  ],
  randomParams(rand) {
    return {
      // Kept off both extremes: under 0.7 the bend flattens to a near-line,
      // over 1.5 the single octave starts fitting two humps in frame and the
      // "one gentle S" brief slips toward a wave.
      scale: 0.7 + rand() * (1.5 - 0.7),
      // Never the skinny extreme (reads as a stray hair at tile size) and
      // never the top of the slider (0.6 is a deliberate "wall of light"
      // setting, not a default composition).
      width: 0.09 + rand() * (0.24 - 0.09),
      glow: 0.3 + rand() * (0.8 - 0.3),
      angle: rand() * 360,
      // Grain is taste, not variation -- always randomize to the default.
      grain: 0.08,
    };
  },
};
