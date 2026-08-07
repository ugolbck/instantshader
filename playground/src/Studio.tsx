import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getShader,
  mountGradient,
  shaders as ALL_SHADERS,
  type MountHandle,
  type ShaderDef,
} from "instantshader";
import { LAB_PALETTES } from "./palettes";
import { MAX_COLORS, MIN_COLORS, parsePalette } from "./parsePalette";

/**
 * Playground: the shader fills the viewport, every control lives in one
 * overlay in the top-right corner. Nothing else on the page — the point is to
 * judge the look at the size it will actually be used, not to read about it.
 *
 * Query params (read once at module init; there is no router): `?shader=`,
 * `?colors=` (any format parsePalette accepts), `?seed=`, `?loop=`.
 */

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
        def={def}
        colors={colors}
        params={params}
        seed={seed}
        speed={speed}
        loopSeconds={looping ? loopSeconds : undefined}
      />

      <aside className="hud">
        <div className="shaders">
          {ALL_SHADERS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === shaderId ? "active" : undefined}
              onClick={() => setShaderId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

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
 * remounting the GL context. */
function Stage({
  def,
  colors,
  params,
  seed,
  speed,
  loopSeconds,
}: {
  def: ShaderDef;
  colors: string[];
  params: Record<string, number>;
  seed: number;
  speed: number;
  loopSeconds: number | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MountHandle | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = mountGradient(container, {
      shader: def,
      colors,
      params,
      seed,
      speed,
      loopSeconds,
    });
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
    // Remount only on shader/seed; everything else flows through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, seed]);

  const colorSig = colors.join(",");
  useEffect(() => {
    handleRef.current?.setColors(colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSig]);

  const paramSig = JSON.stringify(params);
  useEffect(() => {
    handleRef.current?.setParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSig]);

  useEffect(() => {
    handleRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    handleRef.current?.setLoopSeconds(loopSeconds);
  }, [loopSeconds]);

  return <div ref={containerRef} className="stage" />;
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
