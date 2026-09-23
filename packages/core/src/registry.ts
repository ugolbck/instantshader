import type { ShaderDef } from "./types";
import { flow } from "./shaders/flow";
import { beam } from "./shaders/beam";
import { bloom } from "./shaders/bloom";
import { halo } from "./shaders/halo";
import { strata } from "./shaders/strata";
import { dune } from "./shaders/dune";
import { whorl } from "./shaders/whorl";
import { caustic } from "./shaders/caustic";
import { lava } from "./shaders/lava";
import { silk } from "./shaders/silk";
import { aurora } from "./shaders/aurora";
import { ripple } from "./shaders/ripple";

// Order here is alphabetical-by-launch and carries no meaning for
// consumers — display order (UI ordering, grid layout, etc) is a concern
// for whatever's rendering the registry, not this package.
export const shaders: readonly ShaderDef[] = [flow, beam, bloom, halo, strata, dune, whorl, caustic, lava, silk, aurora, ripple];

export function getShader(id: string): ShaderDef | undefined {
  return shaders.find((s) => s.id === id);
}
