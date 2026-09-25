// Public entry point for @instantshader/react.

export { ShaderCanvas } from "./ShaderCanvas";
export type { ShaderCanvasProps } from "./ShaderCanvas";
export { ShaderStack } from "./ShaderStack";
export type { ShaderStackProps } from "./ShaderStack";

export { Flow, Beam, Bloom, Halo, Strata, Dune, Whorl, Silk, Nacre, Burst, Glint } from "./shaders";

// Re-exported for convenience so consumers don't need a direct dependency
// on "instantshader" just to pass a shader def or read its types.
export { flow, beam, bloom, halo, strata, dune, whorl, silk, nacre, burst, glint } from "instantshader";
export { pixelate, dither, halftone, ascii } from "instantshader";
export type { ShaderDef, ParamDef, EffectDef, EffectLayer, EffectParamDef, ParamValue, Source } from "instantshader";
