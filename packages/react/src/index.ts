// Public entry point for @instantshader/react.

export { ShaderCanvas } from "./ShaderCanvas";
export type { ShaderCanvasProps } from "./ShaderCanvas";

export { Flow, Beam, Bloom } from "./shaders";

// Re-exported for convenience so consumers don't need a direct dependency
// on "instantshader" just to pass a shader def or read its types.
export { flow, beam, bloom } from "instantshader";
export type { ShaderDef, ParamDef } from "instantshader";
