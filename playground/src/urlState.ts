import { getEffect, getShader, shaders, type EffectDef, type ParamValue } from "instantshader";
import { DEFAULT_PALETTE } from "./palettes";
import { parsePalette } from "./parsePalette";

// The whole design lives in the query string, so a URL is a shareable,
// reloadable state. Format:
//
//   ?shader=flow&colors=1a1446-5b2a9e-e0457b&seed=12&speed=1&loop=24
//   &p=scale:1.2,curl:0.8
//   &stack=halftone:size=14;blend=screen|!tint:mode=palette
//
// `stack` lists layers bottom first; a leading "!" marks a layer switched
// off. The older single-layer form (`effect=dither&fx=size:4,levels:3`)
// still loads.

export type Layer = { id: number; effectId: string; params: Record<string, ParamValue>; enabled: boolean };

export type StudioState = {
  shaderId: string;
  colors: string[];
  seed: number;
  speed: number;
  loop: number | null;
  params: Record<string, number>;
  layers: Layer[];
};

let nextId = 1;
export function newLayer(effectId: string, params: Record<string, ParamValue> = {}, enabled = true): Layer {
  return { id: nextId++, effectId, params, enabled };
}

function parseValue(def: EffectDef, key: string, raw: string): ParamValue | undefined {
  const p = def.params.find((d) => d.key === key);
  if (!p) return undefined;
  if (p.type === "enum") return raw;
  if (p.type === "color") return raw.startsWith("#") ? raw : `#${raw}`;
  if (p.type === "bool") return raw === "true" || raw === "1";
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseLayer(token: string): Layer | null {
  const enabled = !token.startsWith("!");
  const body = enabled ? token : token.slice(1);
  const [id, rest] = body.split(":", 2) as [string, string | undefined];
  const def = getEffect(id);
  if (!def) return null;
  const params: Record<string, ParamValue> = {};
  for (const pair of (rest ?? "").split(";").filter(Boolean)) {
    const [k, v] = pair.split("=");
    if (v === undefined) continue;
    const value = parseValue(def, k, v);
    if (value !== undefined) params[k] = value;
  }
  return newLayer(id, params, enabled);
}

export function readState(search: URLSearchParams): StudioState {
  const shaderId = getShader(search.get("shader") ?? "")?.id ?? shaders[0].id;
  const params: Record<string, number> = {};
  for (const pair of (search.get("p") ?? "").split(",").filter(Boolean)) {
    const [k, v] = pair.split(":");
    const n = Number(v);
    if (k && Number.isFinite(n)) params[k] = n;
  }

  let layers: Layer[] = [];
  const stack = search.get("stack");
  if (stack) {
    layers = stack.split("|").map(parseLayer).filter((l): l is Layer => l !== null);
  } else if (search.get("effect")) {
    const def = getEffect(search.get("effect")!);
    if (def) {
      const legacy: Record<string, ParamValue> = {};
      for (const pair of (search.get("fx") ?? "").split(",").filter(Boolean)) {
        const [k, v] = pair.split(":");
        const value = v === undefined ? undefined : parseValue(def, k, v);
        if (value !== undefined) legacy[k] = value;
      }
      layers = [newLayer(def.id, legacy)];
    }
  }

  const loopRaw = search.get("loop");
  return {
    shaderId,
    colors: parsePalette(search.get("colors") ?? "") ?? DEFAULT_PALETTE.colors,
    seed: Number(search.get("seed") ?? "12") || 0,
    speed: search.has("speed") ? Number(search.get("speed")) || 0 : 1,
    loop: loopRaw === null ? null : Number(loopRaw) || 24,
    params,
    layers,
  };
}

const num = (v: number) => String(Math.round(v * 1000) / 1000);

export function writeState(s: StudioState): string {
  const q = new URLSearchParams();
  q.set("shader", s.shaderId);
  q.set("colors", s.colors.map((c) => c.replace("#", "")).join("-"));
  q.set("seed", num(s.seed));
  if (s.speed !== 1) q.set("speed", num(s.speed));
  if (s.loop !== null) q.set("loop", num(s.loop));
  const p = Object.entries(s.params).map(([k, v]) => `${k}:${num(v)}`);
  if (p.length) q.set("p", p.join(","));
  if (s.layers.length) {
    q.set(
      "stack",
      s.layers
        .map((l) => {
          const kv = Object.entries(l.params).map(
            ([k, v]) => `${k}=${typeof v === "number" ? num(v) : String(v).replace("#", "")}`,
          );
          return `${l.enabled ? "" : "!"}${l.effectId}${kv.length ? `:${kv.join(";")}` : ""}`;
        })
        .join("|"),
    );
  }
  // URLSearchParams escapes ":" "|" ";" which makes links unreadable; they
  // are all legal in a query string.
  return q
    .toString()
    .replace(/%3A/g, ":")
    .replace(/%7C/g, "|")
    .replace(/%3B/g, ";")
    .replace(/%2C/g, ",")
    .replace(/%3D/g, "=")
    .replace(/%21/g, "!");
}
