import { useState } from "react";
import { effects as ALL_EFFECTS, getEffect, type EffectParamDef, type GridInfo, type ParamValue } from "instantshader";
import { Group, ParamControl } from "./controls";
import { groupEffectParams } from "./paramGroups";
import { newLayer, type Layer } from "./urlState";

// Effects as a stack, bottom layer first, the way the renderer applies them.
// Each layer folds to one row so a long stack stays scannable; the open one
// shows its params grouped by what they adjust.

const BLURBS: Record<string, string> = {
  pixelate: "Flat blocks",
  dither: "Dotted patterns",
  halftone: "Print dots and lines",
  ascii: "Characters",
  tint: "Recolour",
};

function visible(def: EffectParamDef, values: Record<string, ParamValue>, all: EffectParamDef[]): boolean {
  if (!def.when) return true;
  const other = all.find((p) => p.key === def.when!.key);
  const current = values[def.when.key] ?? other?.default;
  return current !== undefined && def.when.in.includes(current);
}

export function EffectStack({
  layers,
  gridInfo,
  onChange,
}: {
  layers: Layer[];
  gridInfo: GridInfo[];
  onChange: (layers: Layer[]) => void;
}) {
  const [openId, setOpenId] = useState<number | null>(layers[layers.length - 1]?.id ?? null);

  const update = (id: number, patch: Partial<Layer>) =>
    onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const move = (i: number, by: number) => {
    const next = layers.slice();
    const [l] = next.splice(i, 1);
    next.splice(i + by, 0, l);
    onChange(next);
  };

  return (
    <div className="stack">
      {layers.length === 0 ? (
        <p className="empty">
          No effects yet. Add one below; each new effect goes on top and works on everything under it.
        </p>
      ) : null}
      <ol className="layers">
        {layers.map((layer, i) => {
          const def = getEffect(layer.effectId);
          if (!def) return null;
          const open = openId === layer.id;
          const info = gridInfo.find((g) => g.index === i);
          const tooFine = info ? Math.min(...info.pxPerCell) < 2 : false;
          return (
            <li key={layer.id} className={`layer${open ? " open" : ""}${layer.enabled ? "" : " off"}`}>
              <div className="layer-row">
                <button
                  type="button"
                  className="layer-name"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : layer.id)}
                >
                  <span className="caret" aria-hidden />
                  {def.label}
                  {info ? <small>{info.cols} × {info.rows}</small> : null}
                </button>
                <div className="layer-tools">
                  <button
                    type="button"
                    className="icon"
                    aria-label={layer.enabled ? `Turn ${def.label} off` : `Turn ${def.label} on`}
                    title={layer.enabled ? "Turn off" : "Turn on"}
                    aria-pressed={layer.enabled}
                    onClick={() => update(layer.id, { enabled: !layer.enabled })}
                  >
                    {layer.enabled ? "◉" : "○"}
                  </button>
                  <button type="button" className="icon" aria-label={`Move ${def.label} up`} title="Move up" disabled={i === layers.length - 1} onClick={() => move(i, 1)}>
                    ↑
                  </button>
                  <button type="button" className="icon" aria-label={`Move ${def.label} down`} title="Move down" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon danger"
                    aria-label={`Remove ${def.label}`}
                    title="Remove"
                    onClick={() => onChange(layers.filter((l) => l.id !== layer.id))}
                  >
                    ×
                  </button>
                </div>
              </div>
              {open ? (
                <div className="layer-body">
                  {(() => {
                    const groups = groupEffectParams(def)
                      .map((g) => ({ ...g, params: g.params.filter((p) => visible(p, layer.params, def.params)) }))
                      .filter((g) => g.params.length > 0);
                    const controls = (params: EffectParamDef[]) =>
                      params.map((p) => (
                        <ParamControl
                          key={p.key}
                          def={p}
                          value={layer.params[p.key] ?? p.default}
                          onChange={(v) => update(layer.id, { params: { ...layer.params, [p.key]: v } })}
                        />
                      ));
                    // A single group needs no heading: the layer name is it.
                    if (groups.length === 1) return controls(groups[0].params);
                    return groups.map((g) => (
                      <Group key={g.title} title={g.title} defaultOpen={!g.collapsed}>
                        {controls(g.params)}
                      </Group>
                    ));
                  })()}
                  {info ? (
                    // Under ~2 device px per cell no screen can resolve a
                    // one-cell pattern; the preview then shows the right
                    // brightness but not the detail the export will have.
                    <p className={tooFine ? "note warn" : "note"}>
                      {info.cols} × {info.rows} cells, {info.pxPerCell[0].toFixed(1)} px each on this screen
                      {tooFine ? ". Too fine to see here; check the 4K comparison." : "."}
                    </p>
                  ) : null}
                  <div className="row">
                    <button type="button" onClick={() => update(layer.id, { params: def.randomParams(Math.random) })}>
                      Randomize
                    </button>
                    <button type="button" disabled={Object.keys(layer.params).length === 0} onClick={() => update(layer.id, { params: {} })}>
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="add">
        <span className="label">Add on top</span>
        <div className="add-grid">
          {ALL_EFFECTS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                const layer = newLayer(e.id);
                onChange([...layers, layer]);
                setOpenId(layer.id);
              }}
            >
              {e.label}
              <small>{BLURBS[e.id] ?? ""}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
