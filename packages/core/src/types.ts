// Core type contracts for InstantShader. Every other module in this package
// (and every consumer outside it) is written against these shapes, so
// changing a field here is a breaking change for the whole library.

/**
 * Describes a single tunable knob exposed by a shader (e.g. "frequency",
 * "warp amount"). The renderer uses this metadata to build UI controls and
 * to validate/clamp incoming values; it does not carry a value itself.
 */
export type ParamDef = {
  /** Param identifier. The GLSL uniform name is always "u_" + key. */
  key: string;
  /** Human-readable label for UI controls (sliders, etc). */
  label: string;
  min: number;
  max: number;
  step: number;
  /** Value used when no override is supplied in MountOptions.params. */
  default: number;
};

/**
 * A registered shader "look". `fragment` is raw GLSL source that assumes
 * BASE_UNIFORMS (time, resolution, palette texture, etc — defined elsewhere
 * in the kit) plus one `uniform float u_<key>` per entry in `params`.
 */
export type ShaderDef = {
  /** Stable identifier used to look this shader up via getShader(id). */
  id: string;
  label: string;
  fragment: string;
  params: ParamDef[];
  /**
   * Produces a full param set for "randomize" flows. Takes a seeded RNG
   * (0-1 uniform) rather than calling Math.random() directly so results are
   * reproducible when the same seed is replayed via MountOptions.seed.
   */
  randomParams: (rand: () => number) => Record<string, number>;
};

/** Options accepted by the kit's mount() entry point. */
export type MountOptions = {
  /** The shader to render. */
  shader: ShaderDef;
  /** Hex color stops forming the gradient's palette ramp, in order. */
  colors: string[];
  /** Overrides for the shader's params; unset keys fall back to ParamDef.default. */
  params?: Record<string, number>;
  /** Animation speed multiplier. Defaults to 1. */
  speed?: number;
  /** RNG seed for any randomized/time-offset behavior. Defaults to 0. */
  seed?: number;
  /**
   * Makes the animation repeat exactly every `loopSeconds`, with no visible
   * seam at the wrap — the frame at t and at t + loopSeconds are identical
   * pixel for pixel. Intended for video export and for backgrounds that must
   * not betray a restart. Omit (the default) for an animation that never
   * repeats.
   *
   * Measured in ANIMATION seconds, so it interacts with `speed`: a 10s loop
   * at speed 2 completes in 5 wall-clock seconds. Leave `speed` at 1 when
   * exporting to a fixed-length video.
   *
   * Short periods are where the cost shows. Under ~29s beam's width swell
   * stops animating (see loopFreq in the GLSL preamble), and below ~10s the
   * rotation of the drift direction becomes noticeable as a slow circling of
   * the whole composition. 15-60s is the comfortable range.
   */
  loopSeconds?: number;
};

/** Live handle returned by mount(), used to control a running gradient instance. */
export type MountHandle = {
  canvas: HTMLCanvasElement;
  setColors(colors: string[]): void;
  setParams(params: Record<string, number>): void;
  setSpeed(speed: number): void;
  /** Changes the seamless-loop period; pass undefined (or 0) to stop looping.
   * See MountOptions.loopSeconds. Takes effect on the next painted frame, and
   * because the shader clock wraps at the period, changing this mid-playback
   * jumps the animation rather than easing into the new cycle. */
  setLoopSeconds(seconds: number | undefined): void;
  pause(): void;
  resume(): void;
  /** Jumps playback to an absolute time position, in milliseconds. */
  seek(ms: number): void;
  getTimeMs(): number;
  /** Tears down the WebGL context and stops the render loop. Idempotent. */
  dispose(): void;
};

/** Result of a one-shot renderGradientFrame() call: the rendered canvas plus
 * an explicit disposer for its GL context. */
export type RenderFrameResult = {
  canvas: HTMLCanvasElement;
  /** Releases the GL context. Call once the caller is done reading pixels
   * from `canvas` (toDataURL/toBlob/getImageData/drawImage). */
  dispose(): void;
};

/** Options accepted by createRenderer() — the low-level, seekable renderer
 * that mountGradient/renderGradientFrame both build on. */
export type RendererOptions = {
  canvas: HTMLCanvasElement;
  shader: ShaderDef;
  colors: string[];
  params: Record<string, number>;
  seed: number;
  /** Seamless-loop period in animation seconds; omitted/0 disables looping.
   * See MountOptions.loopSeconds. */
  loopSeconds?: number;
};

/** Low-level seekable renderer contract returned by createRenderer(). */
export type { Renderer } from "./renderer";

// ---------------------------------------------------------------------------
// Effects. A GENERATOR (ShaderDef above) draws a picture from nothing; an
// EFFECT reads a picture and draws a new one. A STACK is one source plus an
// ordered list of effect layers.
// ---------------------------------------------------------------------------

/** A generator is what this library has always called a shader. */
export type GeneratorDef = ShaderDef;

/** Effect params are wider than generator params: a dither needs a pattern
 * choice and two colors, which floats cannot express. */
export type ParamValue = number | boolean | string;

type EffectParamBase = {
  /** Param identifier. The GLSL uniform name is always "u_" + key. */
  key: string;
  label: string;
  /** UI hint: show this control only while another param holds one of these
   * values. The runtime ignores it. */
  when?: { key: string; in: ParamValue[] };
};

/** `type` is optional so that a generator's ParamDef is a valid FloatParamDef. */
export type FloatParamDef = EffectParamBase & {
  type?: "float";
  min: number;
  max: number;
  step: number;
  default: number;
};

/** Values are strings so that reordering `options` never changes a saved
 * design. The uniform is a float holding the option's index. */
export type EnumParamDef = EffectParamBase & {
  type: "enum";
  options: { value: string; label: string }[];
  default: string;
};

/** Uniform is a float, 0 or 1. */
export type BoolParamDef = EffectParamBase & { type: "bool"; default: boolean };

/** "#rrggbb". Uniform is a vec3 of gamma-encoded sRGB in 0-1. */
export type ColorParamDef = EffectParamBase & { type: "color"; default: string };

export type EffectParamDef = FloatParamDef | EnumParamDef | BoolParamDef | ColorParamDef;

/** What an EffectTexture's key() and build() get to look at. */
export type TextureEnv = {
  /** The layer's fully resolved params. */
  params: Record<string, ParamValue>;
  /** Frame size in device pixels. */
  width: number;
  height: number;
  /** Device pixels per reference pixel. */
  outputScale: number;
  /** From StackOptions.fontFamily, for effects that draw text. */
  fontFamily: string;
};

export type TextureData = {
  /** Raw bytes are read as one channel when data.length === width * height,
   * as RGBA when it is four times that. */
  source: TexImageSource | { data: Uint8Array; width: number; height: number };
  filter: "nearest" | "linear";
  /** "repeat" is only legal for power-of-two sizes in WebGL1. */
  wrap: "clamp" | "repeat";
  /** Extra uniforms describing the texture, e.g. an atlas's grid and glyph
   * count. A number sets a float, an array a vec2/vec3/vec4. */
  uniforms?: Record<string, number | number[]>;
};

/** An extra texture an effect needs, built by JS: a glyph atlas, a noise tile. */
export type EffectTexture = {
  /** Sampler uniform name, e.g. "u_atlas". */
  uniform: string;
  /** Cache key. The runtime rebuilds the texture when this changes. */
  key: (env: TextureEnv) => string;
  build: (env: TextureEnv) => TextureData;
};

/**
 * A registered effect. Two shapes:
 *
 * - SOFT effect: only `fragment`. Runs once per output pixel and reads the
 *   layer below as `u_source`.
 * - GRID effect: has `grid`. `grid.fragment` is the CELL STAGE, run once per
 *   cell into a small cell buffer whose size depends on params and aspect
 *   ratio only. `fragment` is then the DRAW STAGE that paints that buffer
 *   onto the frame; omit it to get the default coverage upscale.
 *
 * The cell buffer is what makes a 900px preview and a 3840px export contain
 * the same cells. See SPEC-effects.md section 6.
 */
export type EffectDef = {
  id: string;
  label: string;
  params: EffectParamDef[];
  fragment?: string;
  grid?: {
    /** Cell size in reference pixels, from the layer's resolved params.
     * Rounded to whole reference pixels unless `lattice` is given. */
    cell: (params: Record<string, ParamValue>) => [number, number];
    /**
     * Makes the grid a LATTICE: rotated by `angle` degrees about the frame
     * centre, with an unrounded pitch. For effects whose draw stage paints
     * soft antialiased shapes (halftone) rather than filling cells, so that
     * nothing needs to land on whole pixels. coverage() is meaningless for a
     * lattice; such an effect must supply its own draw `fragment`.
     */
    lattice?: (params: Record<string, ParamValue>) => { angle: number };
    fragment: string;
  };
  textures?: EffectTexture[];
  /** Same contract as ShaderDef.randomParams. */
  randomParams: (rand: () => number) => Record<string, ParamValue>;
};

/** The bottom of a stack. */
export type Source =
  | { kind: "generator"; shader: ShaderDef; params?: Record<string, number> }
  | { kind: "media"; media: TexImageSource; fit?: "cover" | "contain" };

/** One effect in a stack. */
export type EffectLayer = {
  effect: EffectDef;
  /** Overrides; unset keys fall back to the param's default. */
  params?: Record<string, ParamValue>;
  /** Defaults to true. A disabled layer renders as if it were absent. */
  enabled?: boolean;
};

export type StackOptions = {
  canvas: HTMLCanvasElement;
  source: Source;
  effects?: EffectLayer[];
  /** Hex color stops of the palette ramp. Generators draw with it; effects
   * in "palette" color mode map tone through it. */
  colors: string[];
  seed?: number;
  /** See MountOptions.loopSeconds. Shared by the source and every layer. */
  loopSeconds?: number;
  /** Shown behind contain-fit media and under media alpha. Default black. */
  background?: string;
  /** CSS font-family for effects that draw text. The host must have loaded
   * it (document.fonts.load) before creating the stack. */
  fontFamily?: string;
};

/** Per grid layer: how the grid lands on the current frame. A host can use
 * pxPerCell to warn that a small preview cannot resolve a fine pattern. */
export type GridInfo = {
  /** Index into the layer list. */
  index: number;
  cols: number;
  rows: number;
  pxPerCell: [number, number];
};

/** Options accepted by mountStack(): StackOptions without the canvas (the
 * mount owns one), plus playback speed. */
export type StackMountOptions = Omit<StackOptions, "canvas"> & {
  /** Animation speed multiplier. Defaults to 1. */
  speed?: number;
};

/** Live handle returned by mountStack(). */
export type StackHandle = Omit<MountHandle, "setParams"> & {
  setSource(source: Source): void;
  /** Merges params into a generator source. No-op for a media source. */
  setSourceParams(params: Record<string, number>): void;
  setEffects(layers: EffectLayer[]): void;
  /** Merges params into one layer. */
  setEffectParams(index: number, params: Record<string, ParamValue>): void;
  /** Re-uploads the media element's current pixels. */
  refreshMedia(): void;
  getGridInfo(): GridInfo[];
};

export type { StackRenderer } from "./stack";
