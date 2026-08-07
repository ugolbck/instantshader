// Raw WebGL1 renderer for InstantShader shaders. This file owns every GL call
// in the kit; everything else (index.ts, shader defs) is GL-agnostic.
//
// Zero dependencies on anything outside this package by design — see
// palette.ts for why.

import type { RendererOptions } from "./types";
import { buildPaletteRamp } from "./palette";

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
 * with v_uv carrying the matching 0-1 UV for the fragment shader. */
const VERTEX_SHADER = `attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// prettier-ignore
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

/** Non-negative modulo. JS's `%` is a remainder operator, not a mathematical
 * mod — `-5 % 100` is `-5`, not `95`. u_time/u_seed are documented to land
 * in [0, m), so a negative timeMs (e.g. from an out-of-range seek) or a
 * negative seed must still floor into that range rather than going negative
 * on the GPU. */
function floorMod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/** Compiles one shader stage, logging the info log and throwing on failure
 * so a broken ShaderDef fails loudly at mount time instead of rendering a
 * blank canvas. */
function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("[instantshader] gl.createShader returned null");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    console.error("[instantshader] shader compile error:", info);
    throw new Error(`[instantshader] shader compile error: ${info}`);
  }
  return shader;
}

/** Links a vertex + fragment shader pair into a program, logging and
 * throwing on link failure (e.g. varying mismatch between stages). */
function linkProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("[instantshader] gl.createProgram returned null");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    // Delete the shaders too, not just the program: they were only flagged
    // for deletion (deleteShader is a no-op while still attached), and the
    // caller never reaches its own post-link deleteShader calls because
    // this throws before returning.
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteProgram(program);
    console.error("[instantshader] program link error:", info);
    throw new Error(`[instantshader] program link error: ${info}`);
  }
  return program;
}

export type Renderer = {
  renderAt(timeMs: number): void;
  setColors(colors: string[]): void;
  setParams(params: Record<string, number>): void;
  /** Sets the seamless-loop period in animation seconds; 0/undefined disables
   * looping. See RendererOptions.loopSeconds. */
  setLoopSeconds(seconds: number | undefined): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

/** Normalizes a loop period to the "off" sentinel the GLSL side expects.
 * Non-finite and non-positive values all mean "don't loop", so callers can
 * pass through user input without pre-validating it. */
function normalizeLoop(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds;
}

export function createRenderer(opts: RendererOptions): Renderer {
  const { canvas, shader } = opts;
  let colors = opts.colors;
  let params = opts.params;
  const seed = opts.seed;
  let loopSeconds = normalizeLoop(opts.loopSeconds);

  const glOrNull = canvas.getContext("webgl", {
    preserveDrawingBuffer: true,
    antialias: false,
  }) as WebGLRenderingContext | null;
  if (!glOrNull) {
    throw new Error("[instantshader] failed to acquire a WebGL context");
  }
  // Rebound to a definitely-non-null binding: the nested function
  // declarations below (uploadPalette, renderAt, etc) are hoisted, so
  // TypeScript's control-flow narrowing from the guard above doesn't carry
  // into them if they keep referencing `glOrNull`'s declared union type.
  const gl: WebGLRenderingContext = glOrNull;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, BASE_UNIFORMS + shader.fragment);
  const program = linkProgram(gl, vertexShader, fragmentShader);
  // Shader objects are refcounted by the program once linked; flag them for
  // deletion now so they're freed as soon as the program itself is deleted.
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  // Fullscreen quad vertex buffer, bound to a_position.
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  // Palette ramp texture: 1024x1 RGBA. Height 1 makes this a non-power-of-two
  // texture along that axis, so WebGL1 forbids REPEAT wrap and mipmaps for it
  // — CLAMP_TO_EDGE (both axes, for consistency) and LINEAR-only filtering
  // (no mipmaps) are the only legal combination, which is exactly what a 1D
  // LUT wants anyway (no wraparound, smooth interpolation between texels).
  const paletteTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  function uploadPalette(hexColors: string[]): void {
    const ramp = buildPaletteRamp(hexColors);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
  }
  uploadPalette(colors);

  const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const timeLoc = gl.getUniformLocation(program, "u_time");
  const seedLoc = gl.getUniformLocation(program, "u_seed");
  const loopLoc = gl.getUniformLocation(program, "u_loop");
  const paletteLoc = gl.getUniformLocation(program, "u_palette");
  // One uniform location per declared param, looked up once at construction
  // rather than on every renderAt() call.
  const paramLocs = new Map<string, WebGLUniformLocation | null>();
  for (const paramDef of shader.params) {
    paramLocs.set(paramDef.key, gl.getUniformLocation(program, `u_${paramDef.key}`));
  }

  function applyParams(): void {
    for (const paramDef of shader.params) {
      const loc = paramLocs.get(paramDef.key);
      if (loc == null) continue;
      const value = params[paramDef.key] ?? paramDef.default;
      gl.uniform1f(loc, value);
    }
  }

  function renderAt(timeMs: number): void {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);

    gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    // Mod into a small range before handing to the GPU: float32 loses
    // sub-millisecond precision once the raw value climbs into the
    // thousands-of-seconds range a long-running session would reach.
    //
    // When looping, mod by the PERIOD rather than by 1000. Two reasons, and
    // the first is a correctness bug rather than a nicety:
    //  - 1000 is not generally a whole number of loop periods, so wrapping
    //    there would land mid-cycle and put one visibly discontinuous frame
    //    into the animation every ~16.7 minutes.
    //  - it makes u_time itself exactly periodic, which is what lets grain()
    //    -- an uncorrelated per-pixel hash that no circular-path trick can
    //    fix -- come out bit-identical at t=0 and t=period.
    const timeSec = floorMod(timeMs / 1000, loopSeconds > 0 ? loopSeconds : 1000);
    gl.uniform1f(timeLoc, timeSec);
    gl.uniform1f(seedLoc, floorMod(seed, 100));
    gl.uniform1f(loopLoc, loopSeconds);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.uniform1i(paletteLoc, 0);

    applyParams();

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function setColors(next: string[]): void {
    colors = next;
    uploadPalette(colors);
  }

  function setParams(next: Record<string, number>): void {
    params = next;
  }

  function setLoopSeconds(seconds: number | undefined): void {
    loopSeconds = normalizeLoop(seconds);
  }

  function resize(width: number, height: number): void {
    canvas.width = width;
    canvas.height = height;
  }

  function dispose(): void {
    gl.deleteTexture(paletteTexture);
    gl.deleteProgram(program);
    gl.deleteBuffer(quadBuffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { renderAt, setColors, setParams, setLoopSeconds, resize, dispose };
}
