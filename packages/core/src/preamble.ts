// GLSL every program in the kit is built from: the preamble prepended to
// every generator and effect fragment, and the one vertex shader they share.

/**
 * GLSL preamble prepended to every shader's fragment source. Declares the
 * uniforms/varying every InstantShader shader can rely on, plus two helpers:
 *
 * - `worldUv()`: maps the 0-1 quad UV into a fixed 1000x562.5 "world" space,
 *   cover-fit to the canvas aspect ratio. Shaders should sample noise/pattern
 *   functions with this instead of the raw UV so pattern density (frequency
 *   of waves, blobs, etc) stays identical between a small preview and a 4K
 *   export of the same scene — otherwise the same "scale" param would look
 *   like a completely different pattern at different resolutions.
 * - `palette(t)`: samples the 1D OKLCh-interpolated color ramp texture.
 *
 * `u_time` and `u_seed` arrive pre-modded (see renderAt below) so that a
 * shader doing `sin(u_time * freq)` never loses float32 precision from a
 * time value that has grown large over a long-running session.
 *
 * Two more helpers exist so shaders can be made seamlessly loopable without
 * each one reinventing the maths — see loopDrift/loopFreq below. Any shader
 * whose only time dependence goes through those two (plus grain(), which
 * loops for free because u_time itself wraps at the period) is exactly
 * periodic with period `u_loop`.
 */
export const BASE_UNIFORMS = `precision highp float;
uniform vec2 u_resolution;   // canvas pixels
uniform float u_time;        // seconds, pre-modded to [0,1000), or to [0,u_loop) when looping
uniform float u_seed;        // pre-modded to [0,100)
uniform float u_loop;        // seconds per seamless cycle; 0 = never repeat
uniform sampler2D u_palette; // 1024x1 OKLCh-interpolated ramp
varying vec2 v_uv;           // 0-1 quad UV
// World-space UV: cover-fit a fixed 1000x562.5 world so pattern density
// is identical between the preview and a 4K export of the same scene.
vec2 worldUv() {
  float worldAspect = 1000.0 / 562.5;
  float canvasAspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv - 0.5;
  if (canvasAspect > worldAspect) { uv.y *= worldAspect / canvasAspect; }
  else { uv.x *= canvasAspect / worldAspect; }
  return uv + 0.5;
}
vec3 palette(float t) {
  return texture2D(u_palette, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

const float TAU = 6.2831853;

// Time-varying offset for a noise sample coordinate.
//
// Not looping (u_loop == 0): a plain linear translation, dir * rate * t.
// This is the arithmetic the shaders used before looping existed, so the
// default path is bit-identical to the pre-loop renderer.
//
// Looping: the same walk, bent into a closed circle of circumference
// rate * |dir| * u_loop. Because the offset returns to exactly where it
// started after u_loop seconds, every value derived from it does too --
// that is the whole loop. A circle (rather than, say, a sine ping-pong on
// one axis) is what keeps this invisible: the drift DIRECTION rotates
// smoothly through 360 degrees over the cycle and never reverses, which on
// an isotropic noise field is indistinguishable from continuing to travel
// in a straight line. The radius is set from arc length, so the sampled
// point covers the same distance per second whether looping or not and the
// animation runs at an identical apparent speed either way.
//
// |dir| matters and is easy to get wrong: a shader adding a scalar drift to
// both components of a vec2 is translating along the diagonal at rate*sqrt(2),
// not at rate. Passing dir un-normalized lets each call site keep its
// original speed exactly.
//
// Radii stay small (rate 0.05 over a 60s loop gives r ~ 0.48, well under the
// noise field's ~1-unit feature size), so this never approaches the
// float-precision ceiling noise.ts warns about.
vec2 loopDrift(float rate, vec2 dir) {
  if (u_loop <= 0.0) return dir * (rate * u_time);
  float phase = TAU * u_time / u_loop;
  return vec2(cos(phase), sin(phase)) * (rate * length(dir) * u_loop / TAU);
}

// Straight-line travel that still loops, for shaders sampling a noise field
// that TILES with period "tile" (see PERIODIC_2D in shaders/noise.ts).
//
// This is the better half of loopDrift, and the difference is the whole
// reason it exists. loopDrift has to curve, because a simplex field never
// repeats, so the only way back to the start is to come around -- and a
// drift direction that rotates through 360 degrees per cycle is perceived as
// the composition swaying back and forth. Against a tiling field the path can
// stay perfectly straight: travel exactly one tile and the field you are
// standing in is bit-identical to the one you left. The motion never turns,
// so it reads as continuous flow.
//
// The cost is that speed is no longer free. Travel per cycle is pinned to the
// tile size, so rate becomes tile/u_loop: a short loop flows fast, a long one
// slowly. The tile cannot simply be shrunk to compensate, because a tile
// narrower than the visible frame means the field repeats WITHIN one frame,
// which is a far worse artifact than any of this. Callers should size it
// from their own sampling frequency.
vec2 loopTravel(float rate, vec2 dir, float tile) {
  if (u_loop <= 0.0) return dir * (rate * u_time);
  return dir * (tile * u_time / u_loop);
}

// Snaps an angular frequency to a whole number of cycles per loop, which is
// what makes sin(loopFreq(w) * u_time + anything) exactly periodic.
//
// Rounding to ZERO is deliberate and is the useful case, not a degenerate
// one: when the loop is shorter than about half the oscillation's natural
// period, the nearest legal frequency would be far faster than the shader
// was tuned for, turning a slow swell into a throb. Returning 0 instead
// freezes the oscillation at its per-pixel phase, so a spatially-varying
// term stays spatially varying and simply stops animating -- a far less
// visible change than speeding it up.
float loopFreq(float w) {
  if (u_loop <= 0.0) return w;
  return TAU * floor(w * u_loop / TAU + 0.5) / u_loop;
}
`;

/** Fullscreen-triangle-strip vertex shader. Four vertices covering [-1,1]^2,
 * with v_uv carrying the matching 0-1 UV for the fragment shader.
 *
 * v_uv = u_uvMatrix * a_position + u_uvOffset. For every ordinary pass that
 * is (0.5, 0, 0, 0.5) and (0.5, 0.5), i.e. exactly the a_position * 0.5 + 0.5
 * this shader always computed. The stack changes it only while rendering a
 * source straight into a grid effect's cell buffer: that grid can overhang
 * the frame (partial cells at the edges) or be rotated (a halftone lattice),
 * and each cell has to see its own centre as v_uv. See gridUvTransform(). */
export const VERTEX_SHADER = `attribute vec2 a_position;
uniform vec4 u_uvMatrix;
uniform vec2 u_uvOffset;
varying vec2 v_uv;
void main() {
  v_uv = mat2(u_uvMatrix.xy, u_uvMatrix.zw) * a_position + u_uvOffset;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
