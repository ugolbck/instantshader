import type { ShaderDef } from "./types";
import { flow } from "./shaders/flow";
import { beam } from "./shaders/beam";

// Order here is alphabetical-by-launch and carries no meaning for
// consumers — display order (UI ordering, grid layout, etc) is a concern
// for whatever's rendering the registry, not this package.
export const shaders: readonly ShaderDef[] = [flow, beam];

export function getShader(id: string): ShaderDef | undefined {
  return shaders.find((s) => s.id === id);
}
