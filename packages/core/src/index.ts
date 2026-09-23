// Public entry point for InstantShader. Everything a consumer needs — shader
// discovery, a live DOM-mounted gradient, and a one-shot detached-canvas
// renderer for exports — is exposed from here.

// Individual shader defs — the primary import path. Unused ones tree-shake.
export { flow } from "./shaders/flow";
export { beam } from "./shaders/beam";
export { bloom } from "./shaders/bloom";
export { halo } from "./shaders/halo";
export { strata } from "./shaders/strata";
export { dune } from "./shaders/dune";
export { whorl } from "./shaders/whorl";
export { caustic } from "./shaders/caustic";
export { lava } from "./shaders/lava";
export { silk } from "./shaders/silk";
export { aurora } from "./shaders/aurora";
export { ripple } from "./shaders/ripple";

// Effects: shaders that redraw an existing picture (a generator's output or
// imported media). Same import story as the generators above.
export { pixelate } from "./effects/pixelate";
export { dither } from "./effects/dither";
export { halftone } from "./effects/halftone";
export { ascii } from "./effects/ascii";

// Registry conveniences — importing these pulls ALL shaders (documented as such).
export { shaders, getShader } from "./registry";
export { effects, getEffect } from "./effectRegistry";

// Runtime
export { mountGradient, mountStack } from "./mount";
export { renderGradientFrame, renderStackFrame } from "./frame";
/** Low-level seekable-renderer escape hatch for export pipelines: video
 * encoders need renderAt(t) on a persistent canvas, while mountGradient owns
 * its own loop and renderGradientFrame is one-shot. */
export { createRenderer } from "./renderer";
/** The renderer under all of the above: one source plus effect layers. */
export { createStackRenderer } from "./stack";
export { gridFor } from "./grid";
export type { Grid } from "./grid";
export { buildPaletteRamp } from "./palette";

export type {
  ShaderDef,
  ParamDef,
  MountOptions,
  MountHandle,
  RenderFrameResult,
  RendererOptions,
  Renderer,
  GeneratorDef,
  EffectDef,
  EffectParamDef,
  FloatParamDef,
  EnumParamDef,
  BoolParamDef,
  ColorParamDef,
  ParamValue,
  EffectTexture,
  TextureEnv,
  TextureData,
  Source,
  EffectLayer,
  StackOptions,
  StackMountOptions,
  StackHandle,
  StackRenderer,
  GridInfo,
} from "./types";
