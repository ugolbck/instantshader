// The stack renderer: one source (a generator or media) plus an ordered list
// of effect layers, rendered in one WebGL1 context. This file owns every GL
// call in the kit; createRenderer() in renderer.ts is a zero-layer stack.
//
// Two kinds of layer (see EffectDef):
//
//   soft effect   source/previous layer at frame size -> fragment -> output
//   grid effect   cell source -> cell stage -> draw stage -> output
//
// The grid path is what keeps a small preview and a 4K export identical.
// Its CELL BUFFER has one texel per cell and a size that depends only on the
// effect's params and the frame's aspect ratio, so every output size paints
// the same cells. See SPEC-effects.md section 6.

import type { EffectDef, EffectLayer, EffectTexture, GridInfo, ParamValue, Source, StackOptions } from "./types";
import { buildPaletteRamp } from "./palette";
import { BASE_UNIFORMS, VERTEX_SHADER } from "./preamble";
import { createProgram, createTarget, deleteTarget } from "./gl";
import type { Program, Target } from "./gl";
import { gridFor, gridUvTransform, outputScale, refSize } from "./grid";
import type { Grid } from "./grid";
import { hexToRgb, paramUniform, resolveEffectParams } from "./effectParams";
import { resolveParams } from "./params";
import {
  CELL_PREAMBLE,
  COLOR_MATH,
  COVERAGE_DRAW,
  DRAW_PREAMBLE,
  EFFECT_COMMON,
  SOFT_PREAMBLE,
} from "./effects/chunks";

export type StackRenderer = {
  renderAt(timeMs: number): void;
  setColors(colors: string[]): void;
  /** Swaps the source. Recompiles only when the generator shader changed. */
  setSource(source: Source): void;
  /** Replaces the generator source's params. No-op for a media source. */
  setSourceParams(params: Record<string, number>): void;
  /** Re-uploads the media element's current pixels, e.g. after a video
   * element advanced a frame. */
  refreshMedia(): void;
  /** Replaces the layer list. Layers whose EffectDef is unchanged at the same
   * position keep their compiled programs. */
  setEffects(layers: EffectLayer[]): void;
  /** Merges params into one layer. */
  setEffectParams(index: number, params: Record<string, ParamValue>): void;
  setLoopSeconds(seconds: number | undefined): void;
  resize(width: number, height: number): void;
  getGridInfo(): GridInfo[];
  dispose(): void;
};

// prettier-ignore
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

/** Media wider or taller than this is scaled down through a 2D canvas before
 * upload. 4096 is the texture size ~99.9% of WebGL1 devices support. */
const MAX_MEDIA_SIZE = 4096;

/**
 * Maps a 0-1 frame UV to the media and returns its color flattened over the
 * background. Y is flipped here instead of with UNPACK_FLIP_Y_WEBGL, and
 * alpha is flattened here instead of with UNPACK_PREMULTIPLY_ALPHA_WEBGL:
 * both pixel-store flags are unspecified for VideoFrame and deprecated for
 * non-DOM sources in Firefox.
 */
const MEDIA_SAMPLER = `
uniform sampler2D u_media;
uniform vec2 u_mediaScale;   // frame UV -> media UV, about the centre
uniform vec3 u_background;
vec3 pictureAt(vec2 uv) {
  vec2 m = (uv - 0.5) * u_mediaScale + 0.5;
  float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
  vec4 c = texture2D(u_media, vec2(m.x, 1.0 - m.y));
  return mix(u_background, c.rgb, c.a * inside);
}
`;

const FRAME_SAMPLER = `
uniform sampler2D u_source;
vec3 pictureAt(vec2 uv) { return texture2D(u_source, uv).rgb; }
`;

const MEDIA_FRAME_FRAGMENT = `precision highp float;
varying vec2 v_uv;
${MEDIA_SAMPLER}
void main() { gl_FragColor = vec4(pictureAt(v_uv), 1.0); }
`;

/**
 * Averages a picture over each cell of a grid: the CELL SOURCE for a grid
 * effect that sits on media or on another effect. v_uv is remapped by the
 * vertex shader to span the grid's extent, so it is the cell's centre in
 * frame UV. The taps form a fixed pattern in picture space that does not
 * depend on the output size, which is what keeps the averages (and therefore
 * every threshold decision made from them) identical between preview and
 * export. Averaged in linear light.
 */
function cellAverageFragment(sampler: string, taps: number): string {
  return `precision highp float;
varying vec2 v_uv;
uniform vec2 u_cellU;        // one cell's edge vectors in frame UV (the grid
uniform vec2 u_cellV;        // may be rotated, so they need not be axis-aligned)
${COLOR_MATH}
${sampler}
void main() {
  vec3 acc = vec3(0.0);
  for (int j = 0; j < ${taps}; j++) {
    for (int i = 0; i < ${taps}; i++) {
      vec2 o = (vec2(float(i), float(j)) + 0.5) / ${taps}.0 - 0.5;
      acc += toLinear(pictureAt(v_uv + o.x * u_cellU + o.y * u_cellV));
    }
  }
  gl_FragColor = vec4(toSrgb(acc / ${taps * taps}.0), 1.0);
}
`;
}

type BuiltTexture = {
  def: EffectTexture;
  key: string;
  texture: WebGLTexture | null;
  uniforms: Record<string, number | number[]>;
};

type LayerState = {
  def: EffectDef;
  params: Record<string, ParamValue>;
  enabled: boolean;
  soft: Program | null;
  cell: Program | null;
  draw: Program | null;
  textures: BuiltTexture[];
};

/** Non-negative modulo. JS's `%` is a remainder operator, not a mathematical
 * mod — `-5 % 100` is `-5`, not `95`. u_time/u_seed are documented to land
 * in [0, m), so a negative timeMs (e.g. from an out-of-range seek) or a
 * negative seed must still floor into that range rather than going negative
 * on the GPU. */
function floorMod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/** Normalizes a loop period to the "off" sentinel the GLSL side expects.
 * Non-finite and non-positive values all mean "don't loop", so callers can
 * pass through user input without pre-validating it. */
function normalizeLoop(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds;
}

function mediaSize(media: TexImageSource): [number, number] {
  const m = media as unknown as Record<string, number>;
  const w = m.videoWidth || m.naturalWidth || m.displayWidth || m.width || 1;
  const h = m.videoHeight || m.naturalHeight || m.displayHeight || m.height || 1;
  return [w, h];
}

export function createStackRenderer(opts: StackOptions): StackRenderer {
  const { canvas } = opts;
  let colors = opts.colors;
  const seed = opts.seed ?? 0;
  let loopSeconds = normalizeLoop(opts.loopSeconds);
  const background = hexToRgb(opts.background ?? "#000000") ?? [0, 0, 0];
  const fontFamily = opts.fontFamily ?? "ui-monospace, Menlo, Consolas, monospace";

  const glOrNull = canvas.getContext("webgl", {
    preserveDrawingBuffer: true,
    antialias: false,
  }) as WebGLRenderingContext | null;
  if (!glOrNull) {
    throw new Error("[instantshader] failed to acquire a WebGL context");
  }
  // Rebound to a definitely-non-null binding: the nested function
  // declarations below are hoisted, so TypeScript's control-flow narrowing
  // from the guard above doesn't carry into them.
  const gl: WebGLRenderingContext = glOrNull;

  // One fullscreen quad for every pass. linkProgram pins a_position to
  // location 0 in every program, so this is set up once.
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

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

  // ---- source ---------------------------------------------------------------

  let source: Source = opts.source;
  let generatorProgram: Program | null = null;
  let generatorParams: Record<string, number> = {};
  let mediaTexture: WebGLTexture | null = null;
  let mediaDims: [number, number] = [1, 1];
  // Runtime-owned programs, compiled the first time a stack needs them.
  let mediaFrameProgram: Program | null = null;
  let mediaCellProgram: Program | null = null;
  let downsampleProgram: Program | null = null;

  function uploadMedia(): void {
    if (source.kind !== "media") return;
    let media: TexImageSource = source.media;
    let [w, h] = mediaSize(media);
    if (Math.max(w, h) > MAX_MEDIA_SIZE) {
      const k = MAX_MEDIA_SIZE / Math.max(w, h);
      const scaled = document.createElement("canvas");
      scaled.width = Math.max(1, Math.round(w * k));
      scaled.height = Math.max(1, Math.round(h * k));
      const ctx = scaled.getContext("2d");
      if (!ctx) throw new Error("[instantshader] 2D context unavailable for media downscale");
      ctx.drawImage(media as CanvasImageSource, 0, 0, scaled.width, scaled.height);
      media = scaled;
      w = scaled.width;
      h = scaled.height;
    }
    mediaDims = [w, h];
    if (!mediaTexture) {
      mediaTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, mediaTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.bindTexture(gl.TEXTURE_2D, mediaTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
  }

  function applySource(next: Source): void {
    const prev = source;
    source = next;
    if (next.kind === "generator") {
      const changed = !generatorProgram || prev.kind !== "generator" || prev.shader !== next.shader;
      if (changed) {
        generatorProgram?.dispose();
        generatorProgram = createProgram(gl, VERTEX_SHADER, BASE_UNIFORMS + next.shader.fragment);
      }
      generatorParams = resolveParams(next.shader, next.params);
    } else {
      uploadMedia();
    }
  }
  applySource(opts.source);

  // ---- layers ---------------------------------------------------------------

  let layers: LayerState[] = [];

  function effectSource(preamble: string, fragment: string): string {
    return BASE_UNIFORMS + EFFECT_COMMON + preamble + fragment;
  }

  function disposeLayer(state: LayerState): void {
    state.soft?.dispose();
    state.cell?.dispose();
    state.draw?.dispose();
    for (const t of state.textures) gl.deleteTexture(t.texture);
  }

  function buildLayer(layer: EffectLayer): LayerState {
    const def = layer.effect;
    const state: LayerState = {
      def,
      params: resolveEffectParams(def, layer.params),
      enabled: layer.enabled ?? true,
      soft: null,
      cell: null,
      draw: null,
      textures: (def.textures ?? []).map((t) => ({ def: t, key: "", texture: null, uniforms: {} })),
    };
    if ((def.textures?.length ?? 0) > 4) {
      throw new Error(`[instantshader] effect "${def.id}" declares more than 4 textures`);
    }
    if (def.grid) {
      state.cell = createProgram(gl, VERTEX_SHADER, effectSource(CELL_PREAMBLE, def.grid.fragment));
      state.draw = createProgram(gl, VERTEX_SHADER, effectSource(DRAW_PREAMBLE, def.fragment ?? COVERAGE_DRAW));
    } else if (def.fragment) {
      state.soft = createProgram(gl, VERTEX_SHADER, effectSource(SOFT_PREAMBLE, def.fragment));
    } else {
      throw new Error(`[instantshader] effect "${def.id}" has neither a fragment nor a grid`);
    }
    return state;
  }

  function applyEffects(next: EffectLayer[]): void {
    const built: LayerState[] = [];
    for (let i = 0; i < next.length; i++) {
      const old = layers[i];
      if (old && old.def === next[i].effect) {
        old.params = resolveEffectParams(old.def, next[i].params);
        old.enabled = next[i].enabled ?? true;
        built.push(old);
      } else {
        built.push(buildLayer(next[i]));
      }
    }
    for (let i = 0; i < layers.length; i++) {
      if (!built.includes(layers[i])) disposeLayer(layers[i]);
    }
    layers = built;
  }
  applyEffects(opts.effects ?? []);

  // ---- targets --------------------------------------------------------------

  let frameTargets: [Target | null, Target | null] = [null, null];
  const cellTargets = new Map<string, [Target, Target]>();
  const cellTargetsUsed = new Set<string>();

  function frameTarget(i: 0 | 1): Target {
    const t = frameTargets[i];
    if (t && t.width === canvas.width && t.height === canvas.height) return t;
    deleteTarget(gl, t);
    const created = createTarget(gl, canvas.width, canvas.height, "linear");
    frameTargets[i] = created;
    return created;
  }

  function cellTargetPair(grid: Grid): [Target, Target] {
    const key = `${grid.cols}x${grid.rows}`;
    cellTargetsUsed.add(key);
    let pair = cellTargets.get(key);
    if (!pair) {
      pair = [
        createTarget(gl, grid.cols, grid.rows, "nearest"),
        createTarget(gl, grid.cols, grid.rows, "nearest"),
      ];
      cellTargets.set(key, pair);
    }
    return pair;
  }

  /** Frees cell buffers the frame just rendered did not use, so dragging a
   * size slider does not accumulate one pair per grid size visited. */
  function pruneCellTargets(): void {
    for (const [key, pair] of cellTargets) {
      if (cellTargetsUsed.has(key)) continue;
      deleteTarget(gl, pair[0]);
      deleteTarget(gl, pair[1]);
      cellTargets.delete(key);
    }
    cellTargetsUsed.clear();
  }

  // ---- per-frame state and pass helpers -------------------------------------

  let timeSec = 0;

  function bindOutput(target: Target | null): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
  }

  function bindTexture(unit: number, texture: WebGLTexture | null): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  /** Uniforms every program built on BASE_UNIFORMS shares. `resolution` is
   * what the program should believe the frame size is, which differs from
   * the real one only when a generator renders into a cell buffer. */
  type UvTransform = { matrix: [number, number, number, number]; offset: [number, number] };
  const IDENTITY_UV: UvTransform = { matrix: [0.5, 0, 0, 0.5], offset: [0.5, 0.5] };

  function useProgram(p: Program, resolution: [number, number], uv: UvTransform = IDENTITY_UV): void {
    gl.useProgram(p.program);
    gl.uniform2f(p.loc("u_resolution"), resolution[0], resolution[1]);
    gl.uniform1f(p.loc("u_time"), timeSec);
    gl.uniform1f(p.loc("u_seed"), floorMod(seed, 100));
    gl.uniform1f(p.loc("u_loop"), loopSeconds);
    gl.uniform4f(p.loc("u_uvMatrix"), uv.matrix[0], uv.matrix[1], uv.matrix[2], uv.matrix[3]);
    gl.uniform2f(p.loc("u_uvOffset"), uv.offset[0], uv.offset[1]);
    bindTexture(0, paletteTexture);
    gl.uniform1i(p.loc("u_palette"), 0);
  }

  function draw(): void {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function setMediaUniforms(p: Program): void {
    if (source.kind !== "media") return;
    const frameAspect = canvas.width / canvas.height;
    const mediaAspect = mediaDims[0] / mediaDims[1];
    const cover = (source.fit ?? "cover") === "cover";
    // Which axis of the media spans the frame exactly; the other axis is
    // cropped (cover) or letterboxed (contain).
    const widthBound = cover ? frameAspect > mediaAspect : frameAspect < mediaAspect;
    const scale: [number, number] = widthBound ? [1, mediaAspect / frameAspect] : [frameAspect / mediaAspect, 1];
    bindTexture(1, mediaTexture);
    gl.uniform1i(p.loc("u_media"), 1);
    gl.uniform2f(p.loc("u_mediaScale"), scale[0], scale[1]);
    gl.uniform3f(p.loc("u_background"), background[0], background[1], background[2]);
  }

  function applyGeneratorParams(p: Program): void {
    if (source.kind !== "generator") return;
    for (const paramDef of source.shader.params) {
      const loc = p.loc(`u_${paramDef.key}`);
      if (loc == null) continue;
      gl.uniform1f(loc, generatorParams[paramDef.key] ?? paramDef.default);
    }
  }

  /** Source at frame size, into a frame target or (null) the canvas. */
  function renderSourceToFrame(target: Target | null): void {
    bindOutput(target);
    if (source.kind === "generator") {
      const p = generatorProgram!;
      useProgram(p, [canvas.width, canvas.height]);
      applyGeneratorParams(p);
    } else {
      mediaFrameProgram ??= createProgram(gl, VERTEX_SHADER, MEDIA_FRAME_FRAGMENT);
      useProgram(mediaFrameProgram, [canvas.width, canvas.height]);
      setMediaUniforms(mediaFrameProgram);
    }
    draw();
  }

  /**
   * Source straight into a cell buffer, skipping the frame-size render.
   *
   * A generator is simply evaluated once per cell. It is told the frame is
   * `ref / cell` pixels large: the aspect ratio is unchanged, so the
   * composition is identical, and generators that antialias an edge over
   * "one pixel" now antialias over one cell, which is the correct area
   * average. That resolution depends on the grid alone, so the cell values
   * are the same at every output size. Grain is switched off for this pass.
   */
  function renderSourceToCells(grid: Grid, target: Target): void {
    bindOutput(target);
    const uv = gridUvTransform(grid);
    if (source.kind === "generator") {
      const p = generatorProgram!;
      const n = Math.max(grid.cell[0], grid.cell[1]);
      useProgram(p, [grid.ref[0] / n, grid.ref[1] / n], uv);
      applyGeneratorParams(p);
      // Grain is zero-mean per-OUTPUT-PIXEL noise, so its average over a cell
      // is ~0. Evaluated once per cell it would instead land at full strength
      // on every cell and read as dirt once an effect thresholds it. Every
      // generator names the param "grain"; one that doesn't is unaffected.
      gl.uniform1f(p.loc("u_grain"), 0);
    } else {
      mediaCellProgram ??= createProgram(gl, VERTEX_SHADER, cellAverageFragment(MEDIA_SAMPLER, 8));
      const p = mediaCellProgram;
      useProgram(p, [canvas.width, canvas.height], uv);
      setMediaUniforms(p);
      gl.uniform2f(p.loc("u_cellU"), uv.cellU[0], uv.cellU[1]);
      gl.uniform2f(p.loc("u_cellV"), uv.cellV[0], uv.cellV[1]);
    }
    draw();
  }

  /** A frame-size layer output averaged into a cell buffer. */
  function downsampleToCells(input: Target, grid: Grid, target: Target): void {
    bindOutput(target);
    downsampleProgram ??= createProgram(gl, VERTEX_SHADER, cellAverageFragment(FRAME_SAMPLER, 4));
    const p = downsampleProgram;
    const uv = gridUvTransform(grid);
    useProgram(p, [canvas.width, canvas.height], uv);
    bindTexture(1, input.texture);
    gl.uniform1i(p.loc("u_source"), 1);
    gl.uniform2f(p.loc("u_cellU"), uv.cellU[0], uv.cellU[1]);
    gl.uniform2f(p.loc("u_cellV"), uv.cellV[0], uv.cellV[1]);
    draw();
  }

  function uploadTextureData(texture: WebGLTexture, data: ReturnType<EffectTexture["build"]>): void {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const wrap = data.wrap === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const filter = data.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    const src = data.source;
    if ("data" in src && src.data instanceof Uint8Array) {
      const single = src.data.length === src.width * src.height;
      const format = single ? gl.LUMINANCE : gl.RGBA;
      // Single-channel rows are not generally a multiple of 4 bytes.
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, src.width, src.height, 0, format, gl.UNSIGNED_BYTE, src.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    }
  }

  function layerGrid(state: LayerState): Grid {
    const g = state.def.grid!;
    return gridFor(canvas.width, canvas.height, g.cell(state.params), g.lattice?.(state.params));
  }

  /** Rebuilds any of the layer's effect textures whose cache key changed. */
  function syncTextures(state: LayerState): void {
    if (state.textures.length === 0) return;
    const env = {
      params: state.params,
      width: canvas.width,
      height: canvas.height,
      outputScale: outputScale(canvas.width, canvas.height),
      fontFamily,
    };
    for (const t of state.textures) {
      const key = t.def.key(env);
      if (t.texture && key === t.key) continue;
      const data = t.def.build(env);
      t.texture ??= gl.createTexture();
      uploadTextureData(t.texture!, data);
      t.key = key;
      t.uniforms = data.uniforms ?? {};
    }
  }

  /** Effect uniforms: reference-frame info, the layer's params, its effect
   * textures (units 3+) and whatever uniforms those textures declared. */
  function applyEffectUniforms(p: Program, state: LayerState, grid: Grid | null, overGenerator: boolean): void {
    const ref = refSize(canvas.width, canvas.height);
    // Lets palette color mode recover the generator's own ramp coordinate
    // instead of falling back to luma. See COLOR_MODE in effects/chunks.ts.
    gl.uniform1f(p.loc("u_sourceIsRamp"), overGenerator ? 1 : 0);
    gl.uniform1f(p.loc("u_paletteStops"), colors.length);
    gl.uniform2f(p.loc("u_refSize"), ref[0], ref[1]);
    gl.uniform1f(p.loc("u_outputScale"), outputScale(canvas.width, canvas.height));
    if (grid) {
      gl.uniform2f(p.loc("u_gridSize"), grid.cols, grid.rows);
      gl.uniform2f(p.loc("u_cellRef"), grid.cell[0], grid.cell[1]);
      gl.uniform1f(p.loc("u_gridAngle"), grid.angle);
    }
    for (const paramDef of state.def.params) {
      const loc = p.loc(`u_${paramDef.key}`);
      if (loc == null) continue;
      const v = paramUniform(paramDef, state.params[paramDef.key]);
      if (typeof v === "number") gl.uniform1f(loc, v);
      else gl.uniform3f(loc, v[0], v[1], v[2]);
    }
    state.textures.forEach((t, i) => {
      bindTexture(3 + i, t.texture);
      gl.uniform1i(p.loc(t.def.uniform), 3 + i);
      for (const [name, value] of Object.entries(t.uniforms)) {
        const loc = p.loc(name);
        if (loc == null) continue;
        if (typeof value === "number") gl.uniform1f(loc, value);
        else if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
        else gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
      }
    });
  }

  function renderAt(timeMs: number): void {
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
    timeSec = floorMod(timeMs / 1000, loopSeconds > 0 ? loopSeconds : 1000);

    const active = layers.filter((l) => l.enabled);
    if (active.length === 0) {
      // Same GL path as the pre-effects renderer: source straight to canvas.
      renderSourceToFrame(null);
      return;
    }

    const frameSize: [number, number] = [canvas.width, canvas.height];
    // The frame-size texture holding the picture below the current layer;
    // null while that picture is still the not-yet-rendered source.
    let input: Target | null = null;

    active.forEach((state, i) => {
      const last = i === active.length - 1;
      const outIndex: 0 | 1 = input === frameTargets[0] ? 1 : 0;
      const overGenerator = input === null && source.kind === "generator";
      syncTextures(state);

      if (state.def.grid) {
        const grid = layerGrid(state);
        const [cellIn, cellOut] = cellTargetPair(grid);

        if (input === null) renderSourceToCells(grid, cellIn);
        else downsampleToCells(input, grid, cellIn);

        const cellProgram = state.cell!;
        bindOutput(cellOut);
        useProgram(cellProgram, frameSize);
        applyEffectUniforms(cellProgram, state, grid, overGenerator);
        bindTexture(1, cellIn.texture);
        gl.uniform1i(cellProgram.loc("u_source"), 1);
        draw();

        const out = last ? null : frameTarget(outIndex);
        const drawProgram = state.draw!;
        bindOutput(out);
        useProgram(drawProgram, frameSize);
        applyEffectUniforms(drawProgram, state, grid, overGenerator);
        bindTexture(2, cellOut.texture);
        gl.uniform1i(drawProgram.loc("u_cells"), 2);
        draw();
        input = out;
      } else {
        if (input === null) {
          input = frameTarget(0);
          renderSourceToFrame(input);
        }
        const out = last ? null : frameTarget(input === frameTargets[0] ? 1 : 0);
        const p = state.soft!;
        bindOutput(out);
        useProgram(p, frameSize);
        applyEffectUniforms(p, state, null, overGenerator);
        bindTexture(1, input.texture);
        gl.uniform1i(p.loc("u_source"), 1);
        draw();
        input = out;
      }
    });

    pruneCellTargets();
  }

  function dispose(): void {
    for (const state of layers) disposeLayer(state);
    layers = [];
    generatorProgram?.dispose();
    mediaFrameProgram?.dispose();
    mediaCellProgram?.dispose();
    downsampleProgram?.dispose();
    deleteTarget(gl, frameTargets[0]);
    deleteTarget(gl, frameTargets[1]);
    frameTargets = [null, null];
    for (const pair of cellTargets.values()) {
      deleteTarget(gl, pair[0]);
      deleteTarget(gl, pair[1]);
    }
    cellTargets.clear();
    gl.deleteTexture(mediaTexture);
    gl.deleteTexture(paletteTexture);
    gl.deleteBuffer(quadBuffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return {
    renderAt,
    setColors(next) {
      colors = next;
      uploadPalette(colors);
    },
    setSource(next) {
      applySource(next);
    },
    setSourceParams(next) {
      if (source.kind === "generator") generatorParams = next;
    },
    refreshMedia() {
      uploadMedia();
    },
    setEffects(next) {
      applyEffects(next);
    },
    setEffectParams(index, params) {
      const state = layers[index];
      if (!state) return;
      state.params = resolveEffectParams(state.def, { ...state.params, ...params });
    },
    setLoopSeconds(seconds) {
      loopSeconds = normalizeLoop(seconds);
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    getGridInfo() {
      const info: GridInfo[] = [];
      layers.forEach((state, index) => {
        if (!state.enabled || !state.def.grid) return;
        const grid = layerGrid(state);
        info.push({ index, cols: grid.cols, rows: grid.rows, pxPerCell: grid.pxPerCell });
      });
      return info;
    },
    dispose,
  };
}
