import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getEffect,
  getShader,
  renderStackFrame,
  shaders as ALL_SHADERS,
  type EffectLayer,
  type GridInfo,
  type Source,
  type StackHandle,
} from "instantshader";
import { Group, Slider, Toggle } from "./controls";
import { EffectStack } from "./EffectStack";
import { PalettePanel } from "./PalettePanel";
import { randomPalette } from "./randomPalette";
import { ShaderPicker } from "./ShaderPicker";
import { Stage } from "./Stage";
import { readState, writeState, type Layer } from "./urlState";

/**
 * Playground: the shader fills the viewport; a panel on the right holds the
 * look, the colours and the effect stack, and a transport bar at the bottom
 * holds time and output. The whole state is mirrored into the URL, so any
 * design can be reloaded or shared by copying the address.
 */

type Tab = "look" | "colours" | "effects";

const SHORTCUTS: [string, string][] = [
  ["Space", "Play or pause"],
  ["← →", "Previous or next look"],
  ["R", "Randomize the look"],
  ["G", "Generate a palette"],
  ["C", "Compare with the 4K export"],
  ["H", "Hide the interface"],
];

export default function Studio({ searchParams }: { searchParams: URLSearchParams }) {
  const initial = useMemo(() => readState(searchParams), [searchParams]);
  const [shaderId, setShaderId] = useState(initial.shaderId);
  const [colors, setColors] = useState(initial.colors);
  const [params, setParams] = useState<Record<string, number>>(initial.params);
  const [seed, setSeed] = useState(initial.seed);
  const [speed, setSpeed] = useState(initial.speed);
  const [loop, setLoop] = useState<number | null>(initial.loop);
  const [layers, setLayers] = useState<Layer[]>(initial.layers);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [compare, setCompare] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<Tab>(initial.layers.length ? "effects" : "look");
  const [gridInfo, setGridInfo] = useState<GridInfo[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const handleRef = useRef<StackHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const def = getShader(shaderId) ?? ALL_SHADERS[0];
  const source = useMemo<Source>(
    () => (image ? { kind: "media", media: image } : { kind: "generator", shader: def }),
    [image, def],
  );
  const stackLayers = useMemo<EffectLayer[]>(
    () =>
      layers.flatMap((l) => {
        const effect = getEffect(l.effectId);
        return effect ? [{ effect, params: l.params, enabled: l.enabled }] : [];
      }),
    [layers],
  );

  // Mirror state into the URL, debounced so slider drags don't flood history.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = writeState({ shaderId, colors, seed, speed, loop, params, layers });
      window.history.replaceState(null, "", `?${q}`);
    }, 300);
    return () => window.clearTimeout(t);
  }, [shaderId, colors, seed, speed, loop, params, layers]);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 1800);
  }, []);

  const pickShader = useCallback((id: string) => {
    setImage(null);
    setShaderId(id);
    // Params belong to one look; carrying beam's `width` over to flow would
    // leave a key in the URL that nothing reads.
    setParams({});
  }, []);

  const stepShader = useCallback(
    (by: number) => {
      const i = ALL_SHADERS.findIndex((s) => s.id === shaderId);
      pickShader(ALL_SHADERS[(i + by + ALL_SHADERS.length) % ALL_SHADERS.length].id);
    },
    [shaderId, pickShader],
  );

  const randomizeLook = useCallback(() => {
    setSeed(Math.round(Math.random() * 990) / 10);
    setParams(def.randomParams(Math.random));
  }, [def]);

  const loadImage = useCallback((file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = URL.createObjectURL(file);
  }, []);

  const savePng = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const { canvas } = handle;
    const width = 3840;
    const height = Math.round((width * canvas.height) / canvas.width);
    const frame = renderStackFrame({
      source: source.kind === "generator" ? { ...source, params } : source,
      effects: stackLayers,
      colors,
      seed,
      loopSeconds: loop ?? undefined,
      timeMs: handle.getTimeMs(),
      width,
      height,
    });
    frame.canvas.toBlob((blob) => {
      frame.dispose();
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${image ? "image" : shaderId}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      flash("Saved a 4K PNG");
    }, "image/png");
  }, [source, params, stackLayers, colors, seed, loop, image, shaderId, flash]);

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href).then(() => flash("Link copied"));
  }, [flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (key === "arrowright") stepShader(1);
      else if (key === "arrowleft") stepShader(-1);
      else if (key === "r") randomizeLook();
      else if (key === "g") setColors(randomPalette());
      else if (key === "c") setCompare((c) => !c);
      else if (key === "h") setHidden((h) => !h);
      else if (key === "escape") setHidden(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepShader, randomizeLook]);

  const rampStyle = { ["--ramp" as string]: `linear-gradient(90deg, ${colors.join(", ")})` };
  const activeFx = layers.filter((l) => l.enabled).length;

  return (
    <div
      className={hidden ? "studio bare" : "studio"}
      style={rampStyle}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        loadImage(e.dataTransfer.files[0]);
      }}
    >
      <Stage
        source={source}
        layers={stackLayers}
        colors={colors}
        params={params}
        seed={seed}
        speed={speed}
        playing={playing}
        loopSeconds={loop ?? undefined}
        compare={compare}
        onHandle={(h) => (handleRef.current = h)}
        onGridInfo={setGridInfo}
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadImage(e.target.files?.[0])} />

      {dragging ? <div className="dropzone">Drop an image to use it as the source</div> : null}

      <aside className="panel" aria-label="Controls" hidden={hidden}>
        <nav className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "look"} onClick={() => setTab("look")}>
            Look
            <small>{image ? "Image" : def.label}</small>
          </button>
          <button type="button" role="tab" aria-selected={tab === "colours"} onClick={() => setTab("colours")}>
            Colours
            <small className="tab-ramp" />
          </button>
          <button type="button" role="tab" aria-selected={tab === "effects"} onClick={() => setTab("effects")}>
            Effects
            <small>{layers.length ? `${activeFx} of ${layers.length} on` : "None"}</small>
          </button>
        </nav>

        <div className="panel-body">
          {tab === "look" ? (
            <>
              <ShaderPicker
                colors={colors}
                seed={seed}
                value={shaderId}
                imageActive={Boolean(image)}
                onPick={pickShader}
                onPickImage={() => fileRef.current?.click()}
              />
              {image ? (
                <p className="note">
                  Your image is the source. Pick a look above to go back to a shader, or drop another image anywhere.
                </p>
              ) : (
                <Group
                  title={`${def.label} settings`}
                  aside={
                    <div className="row tight">
                      <button type="button" onClick={randomizeLook} title="R">
                        Randomize
                      </button>
                      <button type="button" disabled={Object.keys(params).length === 0} onClick={() => setParams({})}>
                        Reset
                      </button>
                    </div>
                  }
                >
                  {def.params.map((p) => (
                    <Slider
                      key={p.key}
                      label={p.label}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={params[p.key] ?? p.default}
                      defaultValue={p.default}
                      onChange={(v) => setParams((prev) => ({ ...prev, [p.key]: v }))}
                    />
                  ))}
                </Group>
              )}
            </>
          ) : null}

          {tab === "colours" ? <PalettePanel colors={colors} onChange={setColors} /> : null}

          {tab === "effects" ? <EffectStack layers={layers} gridInfo={gridInfo} onChange={setLayers} /> : null}
        </div>

        <details className="shortcuts">
          <summary>Keyboard shortcuts</summary>
          <dl>
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      </aside>

      <footer className="transport" hidden={hidden}>
        <button
          type="button"
          className="play"
          aria-label={playing ? "Pause" : "Play"}
          title="Space"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="transport-field">
          <Slider label="Speed" min={0} max={4} step={0.05} value={speed} defaultValue={1} onChange={setSpeed} />
        </div>
        <div className="transport-field seed">
          <Slider label="Seed" min={0} max={99} step={0.1} value={seed} onChange={setSeed} />
          <button
            type="button"
            className="icon"
            aria-label="New seed"
            title="New seed"
            onClick={() => setSeed(Math.round(Math.random() * 990) / 10)}
          >
            ⚄
          </button>
        </div>
        <div className="transport-field loop">
          <Toggle label="Loop" value={loop !== null} onChange={(on) => setLoop(on ? 24 : null)} />
          {loop !== null ? (
            <Slider
              label="Every"
              // Up to 120s because flow's travel speed is tied to the loop
              // length, so its slow drift only exists at long periods.
              min={2}
              max={120}
              step={1}
              value={loop}
              onChange={setLoop}
              // Loop is in animation seconds, so speed divides it. Showing
              // the real-time length inline beats explaining it.
              readout={`${loop}s, plays in ${(loop / (speed || 1)).toFixed(1)}s`}
            />
          ) : null}
        </div>
        <div className="transport-actions">
          <button type="button" aria-pressed={compare} className={compare ? "on" : undefined} onClick={() => setCompare((c) => !c)} title="C">
            Compare 4K
          </button>
          <button type="button" onClick={savePng}>
            Save PNG
          </button>
          <button type="button" onClick={copyLink}>
            Copy link
          </button>
          <button type="button" onClick={() => setHidden(true)} title="H">
            Hide
          </button>
        </div>
      </footer>

      {hidden ? (
        <button type="button" className="unhide" onClick={() => setHidden(false)}>
          Show controls
        </button>
      ) : null}

      <div className="toast" role="status" aria-live="polite">
        {toast ?? ""}
      </div>
    </div>
  );
}
