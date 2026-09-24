// "Glint" look: a shoal of shards. Hundreds of small angular facets stream
// along one curved current across a dark frame, spinning, flashing as they
// turn, each edge fringed with colour. The only look made of particles.
//
// SPEC
//
// 1. PARTICLES WITHOUT A PARTICLE SYSTEM. Shards live on a lattice in a
//    "stream" space: the frame rotated by u_angle, then bent so the lattice
//    rows follow one slow curve (a sideways offset by a single low-frequency
//    noise of x). Each lattice cell owns at most one shard, placed, sized,
//    oriented and coloured by a hash of the cell index. A pixel visits the
//    3x3 cells around it, so a shard may cross its own cell edge.
//
// 2. THREE DEPTH LAYERS, unrolled: far (small, slow, dim, soft-edged), mid,
//    near (large, fast, bright). Parallax without a camera.
//
// 3. THE LATTICE SLIDES. The cell index is taken modulo TILE along the
//    stream, so the hash repeats every TILE cells, and the lattice travels
//    exactly TILE cells per loop through loopTravel: an exact loop with the
//    shoal always moving one way. Shards spin by loopAngle, so every shard
//    completes whole turns per loop.
//
// 4. A SHARD IS A RHOMBUS SDF, thin (aspect 0.35), drawn three times: the R
//    channel a little ahead along the stream, B a little behind, G in place.
//    That is the chromatic fringe of the reference, from geometry alone.
//
// 5. PALETTE PER SHARD. Each shard is one stop, t = fract(hash + layer
//    offset), flat, so across the shoal every stop is present at full
//    saturation. Twinkle adds a white flash on top when a shard turns edge-on
//    to the light, so dark banks stay visible.
//
// 6. EMISSIVE on the crushed darkest stop, with a faint haze along the
//    current so the shoal has a body.
//
// Against its siblings: nothing else is discrete.

import type { ShaderDef } from "../types";
import { SIMPLEX_2D, GRAIN, ISO, LOOP_ANGLE, SEED } from "./noise";

const FRAGMENT = `
uniform float u_size;
uniform float u_density;
uniform float u_bend;
uniform float u_angle;
uniform float u_speed;
uniform float u_grain;

${SIMPLEX_2D}
${GRAIN}
${ISO}
${LOOP_ANGLE}
${SEED}

const float PI = 3.14159265;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash21(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7)) + u_seed * 0.37) * 43758.5453);
}

// Rhombus coverage at local offset d for half-extents a (along) and b
// (across), edge ramped over aa.
float rhombus(vec2 d, float a, float b, float aa) {
  float s = abs(d.x) / a + abs(d.y) / b - 1.0;
  return 1.0 - smoothstep(-aa, aa, s);
}

void main() {
  vec2 uv = worldUv();
  vec2 p = isoCoord(uv);
  vec2 halfIso = isoHalf();
  float pixel = 2.0 * halfIso.y / u_resolution.y;

  float ang = u_angle * PI / 180.0;
  vec2 q = vec2(p.x * cos(ang) + p.y * sin(ang), -p.x * sin(ang) + p.y * cos(ang));
  vec2 so = seedOffset();
  // The current: one slow bend, so the shoal arcs across the frame.
  float bend = 0.35 * u_bend * snoise(vec2(q.x * 0.9 + so.x, so.y));
  float across = q.y - bend;

  // Background and haze.
  vec3 c0 = palette(0.0);
  vec3 c1 = palette(0.5);
  vec3 c2 = palette(1.0);
  float l0 = dot(c0, LUMA);
  float l1 = dot(c1, LUMA);
  float l2 = dot(c2, LUMA);
  vec3 dk = mix(c0, c1, step(l1, l0));
  dk = mix(dk, c2, step(l2, min(l0, l1)));
  vec3 color = dk * 0.1;
  color += palette(0.5) * 0.05 * exp(-(across * across) / 0.1);

  float tw = loopFreq(1.2) * u_time;
  // Hash period along the stream, in cells. The lattice travels one period
  // per loop, so a short loop would race; halving the period halves that at
  // the cost of the pattern repeating every 8 cells instead of 16.
  float TILE = (u_loop > 0.0 && u_loop < 12.0) ? 8.0 : 16.0;

  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float sizeMul = fl < 0.5 ? 0.5 : (fl < 1.5 ? 0.85 : 1.5);
    float speedMul = fl < 0.5 ? 0.5 : (fl < 1.5 ? 0.8 : 1.2);
    float bright = fl < 0.5 ? 0.45 : (fl < 1.5 ? 0.7 : 1.0);
    float soft = fl < 0.5 ? 2.5 : (fl < 1.5 ? 1.5 : 1.0);

    float shard = u_size * sizeMul;
    float cs = shard * 3.2;
    // The static u_speed term gives the knob a visible effect at t = 0.
    float travel = loopTravel(0.08 * u_speed * speedMul, vec2(1.0, 0.0), cs * TILE).x + 0.3 * u_speed;
    vec2 l = vec2(q.x + travel, across) / cs;
    vec2 cell0 = floor(l);

    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 cell = cell0 + vec2(float(i), float(j));
        vec2 key = vec2(mod(cell.x, TILE), cell.y + fl * 100.0);
        float h1 = hash21(key);
        float h2 = hash21(key + 7.0);
        float h3 = hash21(key + 19.0);
        float h4 = hash21(key + 31.0);
        float h5 = hash21(key + 47.0);

        // Denser along the current, sparser off it.
        float rowY = (cell.y + 0.5) * cs;
        float present = step(h1, u_density * (0.12 + 0.88 * exp(-(rowY * rowY) / 0.05)));
        if (present < 0.5) continue;

        vec2 centre = (cell + vec2(0.15 + 0.7 * h2, 0.15 + 0.7 * h3)) * cs;
        float sz = shard * (0.4 + 0.6 * h4);
        float dir = h5 < 0.5 ? -1.0 : 1.0;
        float ori = h5 * TAU + dir * loopAngle(0.25 + 0.5 * h4);
        float ca = cos(ori);
        float sa = sin(ori);

        vec2 d = vec2(l.x * cs, across) - centre;
        vec2 dl = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
        float aa = pixel * soft / sz;
        float fr = 0.08 * sz;
        float covR = rhombus(vec2((d.x - fr) * ca + d.y * sa, -(d.x - fr) * sa + d.y * ca) / sz, 1.0, 0.35, aa);
        float covG = rhombus(dl / sz, 1.0, 0.35, aa);
        float covB = rhombus(vec2((d.x + fr) * ca + d.y * sa, -(d.x + fr) * sa + d.y * ca) / sz, 1.0, 0.35, aa);

        float twinkle = 0.5 + 0.5 * sin(tw + h2 * TAU + ori * 2.0);
        float flash = twinkle * twinkle * twinkle;
        vec3 col = palette(fract(h3 + 0.13 * fl));
        float lum = dot(col, LUMA);
        col = col * (1.0 + 2.0 * (1.0 - lum) * (1.0 - lum)) * (0.5 + 0.5 * twinkle) + vec3(0.6) * flash;
        col *= bright;
        color += vec3(covR, covG, covB) * col;
      }
    }
  }

  float g = grain(uv, u_time) - 0.5;
  color += g * u_grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const glint: ShaderDef = {
  id: "glint",
  label: "Glint",
  fragment: FRAGMENT,
  params: [
    // Shard length, in frame heights.
    { key: "size", label: "Size", min: 0.01, max: 0.06, step: 0.001, default: 0.03 },
    { key: "density", label: "Density", min: 0.2, max: 1, step: 0.01, default: 0.6 },
    // How far the current arcs across the frame.
    { key: "bend", label: "Bend", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "angle", label: "Angle", min: 0, max: 360, step: 1, default: 10 },
    { key: "speed", label: "Speed", min: 0.3, max: 2, step: 0.01, default: 1 },
    { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  ],
  randomParams(rand) {
    return {
      size: 0.015 + rand() * (0.045 - 0.015),
      density: 0.4 + rand() * (1 - 0.4),
      bend: rand(),
      angle: Math.floor(rand() * 360),
      speed: 0.6 + rand() * (1.6 - 0.6),
      grain: 0.06,
    };
  },
};
