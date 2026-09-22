import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  effects as ALL_EFFECTS,
  getEffect,
  getShader,
  mountStack,
  renderStackFrame,
  shaders as ALL_SHADERS,
  type EffectDef,
  type EffectLayer,
  type EffectParamDef,
  type GridInfo,
  type ParamValue,
  type Source,
  type StackHandle,
} from "instantshader";
import { LAB_PALETTES } from "./palettes";
import { MAX_COLORS, MIN_COLORS, parsePalette } from "./parsePalette";

/**
 * Playground: the shader fills the viewport, every control lives in one
 * overlay in the top-right corner. Nothing else on the page — the point is to
 * judge the look at the size it will actually be used, not to read about it.
 *
 * Query params (read once at module init; there is no router): `?shader=`,
 * `?colors=` (any format parsePalette accepts), `?seed=`, `?loop=`,
 * `?effect=` (an effect id) and `?fx=` (its params, `size:4,colorMode:palette`).
 */

/** "size:4,colorMode:palette,invert:true" -> typed param overrides. */
function parseFx(def: EffectDef | undefined, raw: string | null): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  if (!def || !raw) return out;
  for (const pair of raw.split(",")) {
    const [key, value] = pair.split(":");
    const p = def.params.find((d) => d.key === key);
    if (!p || value === undefined) continue;
    if (p.type === "enum") out[key] = value;
    else if (p.type === "color") out[key] = value.startsWith("#") ? value : `#${value}`;
    else if (p.type === "bool") out[key] = value === "true" || value === "1";
    else out[key] = Number(value);
  }
  return out;
}

const DEFAULT_COLORS = ["#4f46e5", "#ec4899", "#22d3ee"];

export default function Studio({ searchParams }: { searchParams: URLSearchParams }) {
  const [shaderId, setShaderId] = useState(() => searchParams.get("shader") ?? ALL_SHADERS[0].id);
  const [colors, setColors] = useState<string[]>(
    () => parsePalette(searchParams.get("colors") ?? "") ?? DEFAULT_COLORS,
  );
  const [params, setParams] = useState<Record<string, number>>({});
  const [seed, setSeed] = useState(() => Number(searchParams.get("seed") ?? "12") || 0);
  const [speed, setSpeed] = useState(1);
  const [looping, setLooping] = useState(searchParams.has("loop"));
  const [loopSeconds, setLoopSeconds] = useState(
    () => Number(searchParams.get("loop") ?? "24") || 24,
  );

  const def = useMemo(() => getShader(shaderId) ?? ALL_SHADERS[0], [shaderId]);

  // The source is a generator unless an image has been dropped in.
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [effectId, setEffectId] = useState(() => searchParams.get("effect") ?? "");
  const effect = useMemo(() => getEffect(effectId), [effectId]);
  const [fx, setFx] = useState<Record<string, ParamValue>>(() =>
    parseFx(getEffect(searchParams.get("effect") ?? ""), searchParams.get("fx")),
  );
  const [gridInfo, setGridInfo] = useState<GridInfo | null>(null);
  const [compare, setCompare] = useState(false);

  const source = useMemo<Source>(
    () => (image ? { kind: "media", media: image } : { kind: "generator", shader: def }),
    [image, def],
  );
  const layers = useMemo<EffectLayer[]>(() => (effect ? [{ effect, params: fx }] : []), [effect, fx]);

  const fileRef = useRef<HTMLInputElement>(null);
  const loadImage = useCallback((file: File | undefined) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = URL.createObjectURL(file);
  }, []);

  // Params are per-shader, so switching must drop the other shader's
  // overrides — otherwise beam's `width` lingers in the object while flow is
  // mounted and "reset" no longer describes what is actually active.
  useEffect(() => {
    setParams({});
  }, [shaderId]);

  const randomize = useCallback(() => {
    setSeed(Math.random() * 100);
    setParams(def.randomParams(Math.random));
  }, [def]);

  return (
    <>
      <Stage
        source={source}
        layers={layers}
        colors={colors}
        params={params}
        seed={seed}
        speed={speed}
        loopSeconds={looping ? loopSeconds : undefined}
        compare={compare}
        onGridInfo={setGridInfo}
      />

      <aside className="hud">
        <div className="shaders">
          {ALL_SHADERS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={!image && s.id === shaderId ? "active" : undefined}
              onClick={() => {
                setImage(null);
                setShaderId(s.id);
              }}
            >
              {s.label}
            </button>
          ))}
          <button type="button" className={image ? "active" : undefined} onClick={() => fileRef.current?.click()}>
            image…
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadImage(e.target.files?.[0])} />
        </div>

        <Section title="Effect" badge={effect?.label} defaultOpen={Boolean(effect)}>
          <div className="row">
            <select
              value={effectId}
              onChange={(e) => {
                setEffectId(e.target.value);
                setFx({});
              }}
            >
              <option value="">none</option>
              {ALL_EFFECTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <button type="button" disabled={!effect} onClick={() => effect && setFx(effect.randomParams(Math.random))}>
              random
            </button>
            <button type="button" disabled={!effect} onClick={() => setFx({})}>
              reset
            </button>
          </div>
          {effect?.params.map((p) => (
            <EffectControl
              key={p.key}
              def={p}
              values={fx}
              effect={effect}
              onChange={(v) => setFx((prev) => ({ ...prev, [p.key]: v }))}
            />
          ))}
          {effect && gridInfo ? (
            // Under ~2 device px per cell no screen can resolve a one-cell
            // pattern; the preview then shows correct brightness, not detail.
            <p className={Math.min(...gridInfo.pxPerCell) < 2 ? "note warn" : "note"}>
              {gridInfo.cols}×{gridInfo.rows} cells · {gridInfo.pxPerCell.map((v) => v.toFixed(2)).join("×")} px/cell here
            </p>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            compare with 4K export (right half, paused)
          </label>
        </Section>

        <Section title="Palette" badge={`${colors.length}`} defaultOpen>
          <PaletteEditor colors={colors} onChange={setColors} />
        </Section>

        <Section title="Params">
          {def.params.map((p) => (
            <Slider
              key={p.key}
              label={p.label}
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.key] ?? p.default}
              onChange={(v) => setParams((prev) => ({ ...prev, [p.key]: v }))}
            />
          ))}
          <div className="row">
            <button type="button" onClick={randomize}>
              random
            </button>
            <button type="button" onClick={() => setParams({})}>
              reset
            </button>
          </div>
        </Section>

        <Section title="Motion" badge={looping ? `${loopSeconds}s` : undefined}>
          <Slider label="Speed" min={0} max={4} step={0.05} value={speed} onChange={setSpeed} />
          <Slider label="Seed" min={0} max={99} step={0.5} value={seed} onChange={setSeed} />
          <label className="check">
            <input
              type="checkbox"
              checked={looping}
              onChange={(e) => setLooping(e.target.checked)}
            />
            loop
          </label>
          {looping ? (
            <Slider
              label="Loop"
              min={2}
              // Up to 120s because flow's travel speed is now tied to the loop
              // length (tile per cycle), so the slow, hand-tuned drift only
              // exists at long periods. Pair a long loop with a high speed to
              // still land a short file.
              max={120}
              step={1}
              value={loopSeconds}
              onChange={setLoopSeconds}
              // Loop is in animation seconds, so speed divides it. Showing the
              // real-time result inline beats explaining the relationship.
              readout={`${loopSeconds}s → ${(loopSeconds / (speed || 1)).toFixed(1)}s`}
            />
          ) : null}
        </Section>
      </aside>
    </>
  );
}

/** The live canvas, filling the viewport behind the overlay. Split out so a
 * colour or param tweak runs only the cheap handle setter rather than
 * remounting the GL context.
 *
 * `compare` pauses playback, renders the same stack at 3840px wide at the
 * same instant, and lays that export over the right half of the preview: the
 * seam down the middle should be invisible. */
function Stage({
  source,
  layers,
  colors,
  params,
  seed,
  speed,
  loopSeconds,
  compare,
  onGridInfo,
}: {
  source: Source;
  layers: EffectLayer[];
  colors: string[];
  params: Record<string, number>;
  seed: number;
  speed: number;
  loopSeconds: number | undefined;
  compare: boolean;
  onGridInfo: (info: GridInfo | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<StackHandle | null>(null);
  const identity = source.kind === "generator" ? source.shader : source.media;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = mountStack(container, {
      source: source.kind === "generator" ? { ...source, params } : source,
      effects: layers,
      colors,
      seed,
      speed,
      loopSeconds,
    });
    handleRef.current = handle;
    // Exposed for screenshot scripts.
    (window as unknown as { __stack?: StackHandle }).__stack = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
    // Remount only on source/seed; everything else flows through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, seed]);

  const colorSig = colors.join(",");
  useEffect(() => {
    handleRef.current?.setColors(colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSig]);

  const paramSig = JSON.stringify(params);
  useEffect(() => {
    handleRef.current?.setSourceParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSig]);

  const layerSig = JSON.stringify(layers.map((l) => [l.effect.id, l.params]));
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setEffects(layers);
    onGridInfo(handle.getGridInfo()[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerSig, identity, seed]);

  useEffect(() => {
    handleRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    handleRef.current?.setLoopSeconds(loopSeconds);
  }, [loopSeconds]);

  useEffect(() => {
    const handle = handleRef.current;
    const holder = exportRef.current;
    if (!handle || !holder) return;
    if (!compare) {
      handle.resume();
      return;
    }
    handle.pause();
    const { canvas } = handle;
    const width = 3840;
    const height = Math.round((width * canvas.height) / canvas.width);
    const frame = renderStackFrame({
      source: source.kind === "generator" ? { ...source, params } : source,
      effects: layers,
      colors,
      seed,
      loopSeconds,
      timeMs: handle.getTimeMs(),
      width,
      height,
    });
    frame.canvas.style.width = "100%";
    frame.canvas.style.height = "100%";
    holder.replaceChildren(frame.canvas);
    return () => {
      frame.dispose();
      holder.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, layerSig, paramSig, colorSig, identity, seed, loopSeconds]);

  return (
    <>
      <div ref={containerRef} className="stage" />
      <div ref={exportRef} className="stage export" style={{ display: compare ? "block" : "none" }} />
    </>
  );
}

/** One control per effect param, picked by the param's type. Hidden while
 * its `when` condition is unmet. */
function EffectControl({
  def,
  values,
  effect,
  onChange,
}: {
  def: EffectParamDef;
  values: Record<string, ParamValue>;
  effect: EffectDef;
  onChange: (v: ParamValue) => void;
}) {
  if (def.when) {
    const other = effect.params.find((p) => p.key === def.when!.key);
    const current = values[def.when.key] ?? other?.default;
    if (current === undefined || !def.when.in.includes(current)) return null;
  }
  const value = values[def.key] ?? def.default;
  if (def.type === "enum") {
    return (
      <label className="slider">
        <span>{def.label}</span>
        <select value={value as string} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (def.type === "bool") {
    return (
      <label className="check">
        <input type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
        {def.label}
      </label>
    );
  }
  if (def.type === "color") {
    return (
      <label className="check">
        <input type="color" value={value as string} onChange={(e) => onChange(e.target.value)} />
        {def.label}
      </label>
    );
  }
  return (
    <Slider label={def.label} min={def.min} max={def.max} step={def.step} value={value as number} onChange={onChange} />
  );
}

function Section({
  title,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        {title}
        {badge ? <em>{badge}</em> : null}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

function PaletteEditor({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  const [invalid, setInvalid] = useState(false);

  const applyPaste = useCallback(
    (value: string) => {
      const parsed = parsePalette(value);
      if (!parsed) {
        setInvalid(true);
        return;
      }
      onChange(parsed);
      setInvalid(false);
    },
    [onChange],
  );

  return (
    <>
      <div className="swatches">
        {colors.map((hex, i) => (
          <div className="swatch" key={i}>
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(colors.map((c, j) => (j === i ? e.target.value : c)))}
              aria-label={`Colour ${i + 1}`}
            />
            <input
              type="text"
              className="hex"
              value={hex}
              spellCheck={false}
              onChange={(e) => {
                const next = e.target.value;
                // Accept partial typing so the field stays editable; the kit
                // only sees a value once it is a complete hex.
                if (/^#?[0-9a-f]{0,6}$/i.test(next)) {
                  onChange(colors.map((c, j) => (j === i ? next.toLowerCase() : c)));
                }
              }}
            />
            <button
              type="button"
              className="icon"
              disabled={colors.length <= MIN_COLORS}
              onClick={() => onChange(colors.filter((_, j) => j !== i))}
              aria-label={`Remove colour ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="row">
        <button
          type="button"
          disabled={colors.length >= MAX_COLORS}
          onClick={() => onChange([...colors, colors[colors.length - 1]])}
        >
          + colour
        </button>
        <select
          value=""
          onChange={(e) => {
            const found = LAB_PALETTES.find((p) => p.name === e.target.value);
            if (found) onChange(found.colors.slice(0, MAX_COLORS));
          }}
        >
          <option value="">preset…</option>
          {LAB_PALETTES.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        className={invalid ? "paste invalid" : "paste"}
        placeholder="paste instantgradient / coolors link"
        spellCheck={false}
        defaultValue=""
        onChange={() => setInvalid(false)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text) {
            e.preventDefault();
            applyPaste(text);
            e.currentTarget.value = "";
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            applyPaste(e.currentTarget.value);
            e.currentTarget.value = "";
          }
        }}
      />
    </>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  readout,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  readout?: string;
}) {
  // Decimals follow the step, so an integer knob doesn't read "28.00".
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <label className="slider">
      <span>
        {label}
        <em>{readout ?? value.toFixed(decimals)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
