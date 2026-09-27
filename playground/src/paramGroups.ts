import type { EffectDef, EffectParamDef } from "instantshader";

// Effect params arrive in the order each def lists them, which puts shared
// plumbing (ground, blend) ahead of the knobs that make the effect what it
// is. The panel regroups them by what a person is adjusting: the effect's own
// look first, then how it sits on the picture, its colours, then the finer
// tone response. Any key not named here is the effect's own and stays in
// def order under "Look".

const BLEND_KEYS = ["ground", "blend", "opacity", "blur"];
const COLOR_KEYS = ["colorMode", "ink", "paper", "invert"];
const TONE_KEYS = ["style", "exposure", "contrast", "density"];

export type ParamGroup = { title: string; params: EffectParamDef[]; collapsed?: boolean };

export function groupEffectParams(def: EffectDef): ParamGroup[] {
  const pick = (keys: string[]) =>
    keys.map((k) => def.params.find((p) => p.key === k)).filter((p): p is EffectParamDef => Boolean(p));
  const shared = new Set([...BLEND_KEYS, ...COLOR_KEYS, ...TONE_KEYS]);
  const groups: ParamGroup[] = [
    { title: "Look", params: def.params.filter((p) => !shared.has(p.key)) },
    { title: "On the picture", params: pick(BLEND_KEYS) },
    { title: "Colours", params: pick(COLOR_KEYS) },
    { title: "Tone", params: pick(TONE_KEYS), collapsed: true },
  ];
  return groups.filter((g) => g.params.length > 0);
}
