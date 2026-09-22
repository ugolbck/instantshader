import type { EffectDef, EffectParamDef, ParamValue } from "./types";

const warned = new Set<string>();

/** Logs once per distinct problem. A bad value arrives on every slider
 * drag and every frame otherwise. */
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[instantshader] ${message}`);
}

const HEX = /^#?[0-9a-fA-F]{6}$/;

/** "#rrggbb" to gamma-encoded sRGB in 0-1, or null when malformed. */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function isValid(def: EffectParamDef, value: ParamValue): boolean {
  switch (def.type) {
    case "enum":
      return typeof value === "string" && def.options.some((o) => o.value === value);
    case "bool":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" && HEX.test(value);
    default:
      return typeof value === "number" && Number.isFinite(value);
  }
}

/**
 * Builds a full param record (every key present) from a possibly partial
 * override map. A value of the wrong type, an unknown enum value or a
 * malformed color falls back to the param's default and warns once, so a
 * stale saved design degrades instead of throwing.
 */
export function resolveEffectParams(
  def: EffectDef,
  overrides?: Record<string, ParamValue>,
): Record<string, ParamValue> {
  const resolved: Record<string, ParamValue> = {};
  for (const p of def.params) {
    const value = overrides?.[p.key];
    if (value === undefined) {
      resolved[p.key] = p.default;
    } else if (isValid(p, value)) {
      resolved[p.key] = value;
    } else {
      warnOnce(`${def.id}.${p.key}: ignoring invalid value ${JSON.stringify(value)}`);
      resolved[p.key] = p.default;
    }
  }
  return resolved;
}

/**
 * What a resolved param becomes on the GPU: one float for float/enum/bool,
 * three for a color. Enums upload the option's index, which is what lets
 * their stored value stay a stable string.
 */
export function paramUniform(def: EffectParamDef, value: ParamValue): number | [number, number, number] {
  switch (def.type) {
    case "enum":
      return Math.max(0, def.options.findIndex((o) => o.value === value));
    case "bool":
      return value ? 1 : 0;
    case "color":
      return hexToRgb(value as string) ?? [0, 0, 0];
    default:
      return value as number;
  }
}
