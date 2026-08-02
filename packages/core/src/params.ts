import type { ShaderDef } from "./types";

/** Builds a full param record (every ParamDef.key present) from a possibly
 * partial override map, falling back to each param's declared default. */
export function resolveParams(def: ShaderDef, overrides?: Record<string, number>): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const paramDef of def.params) {
    const value = overrides?.[paramDef.key];
    resolved[paramDef.key] = value === undefined ? paramDef.default : value;
  }
  return resolved;
}
