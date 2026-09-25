import type { ShaderDef } from "./types";
import { flow } from "./shaders/flow";
import { beam } from "./shaders/beam";
import { bloom } from "./shaders/bloom";
import { halo } from "./shaders/halo";
import { strata } from "./shaders/strata";
import { dune } from "./shaders/dune";
import { whorl } from "./shaders/whorl";
import { silk } from "./shaders/silk";
import { nacre } from "./shaders/nacre";
import { burst } from "./shaders/burst";
import { glint } from "./shaders/glint";

// Order here is alphabetical-by-launch and carries no meaning for
// consumers — display order (UI ordering, grid layout, etc) is a concern
// for whatever's rendering the registry, not this package.
export const shaders: readonly ShaderDef[] = [flow, beam, bloom, halo, strata, dune, whorl, silk, nacre, burst, glint];

export function getShader(id: string): ShaderDef | undefined {
  return shaders.find((s) => s.id === id);
}
