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

// Registry conveniences — importing these pulls ALL shaders (documented as such).
export { shaders, getShader } from "./registry";

// Runtime
export { mountGradient } from "./mount";
export { renderGradientFrame } from "./frame";
/** Low-level seekable-renderer escape hatch for export pipelines: video
 * encoders need renderAt(t) on a persistent canvas, while mountGradient owns
 * its own loop and renderGradientFrame is one-shot. */
export { createRenderer } from "./renderer";
export { buildPaletteRamp } from "./palette";

export type {
  ShaderDef,
  ParamDef,
  MountOptions,
  MountHandle,
  RenderFrameResult,
  RendererOptions,
  Renderer,
} from "./types";
