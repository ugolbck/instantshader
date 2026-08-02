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
};

/** Live handle returned by mount(), used to control a running gradient instance. */
export type MountHandle = {
  canvas: HTMLCanvasElement;
  setColors(colors: string[]): void;
  setParams(params: Record<string, number>): void;
  setSpeed(speed: number): void;
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
};

/** Low-level seekable renderer contract returned by createRenderer(). */
export type { Renderer } from "./renderer";
