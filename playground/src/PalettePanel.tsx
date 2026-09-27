import { useState } from "react";
import { PALETTE_GROUPS, presetName } from "./palettes";
import { MAX_COLORS, MIN_COLORS, parsePalette } from "./parsePalette";
import { randomPalette } from "./randomPalette";

// The palette as an editable strip of stops, a generator, and a library of
// presets shown as their own gradients so they can be judged at a glance.

const ramp = (colors: string[]) => `linear-gradient(90deg, ${colors.join(", ")})`;

export function PalettePanel({ colors, onChange }: { colors: string[]; onChange: (colors: string[]) => void }) {
  const [pasteError, setPasteError] = useState(false);
  const [selected, setSelected] = useState(0);
  const sel = Math.min(selected, colors.length - 1);
  const current = presetName(colors);

  const setStop = (i: number, hex: string) => onChange(colors.map((c, j) => (j === i ? hex : c)));
  const paste = (value: string) => {
    const parsed = parsePalette(value);
    setPasteError(!parsed);
    if (parsed) onChange(parsed);
  };

  return (
    <div className="palette">
      <div className="ramp-editor">
        <div className="ramp" style={{ background: ramp(colors) }} aria-hidden />
        <div className="stops" role="listbox" aria-label="Colour stops">
          {colors.map((hex, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={i === sel}
              aria-label={`Stop ${i + 1}, ${hex}`}
              className={i === sel ? "stop on" : "stop"}
              style={{ background: hex }}
              onClick={() => setSelected(i)}
            />
          ))}
        </div>
        <div className="stop-edit">
          <span className="chip big" style={{ background: colors[sel] }}>
            <input type="color" value={colors[sel]} onChange={(e) => setStop(sel, e.target.value)} aria-label="Pick colour" />
          </span>
          <input
            type="text"
            className="hex"
            value={colors[sel]}
            spellCheck={false}
            aria-label="Hex value"
            onChange={(e) => {
              const next = e.target.value.toLowerCase();
              // Accept partial typing so the field stays editable.
              if (/^#?[0-9a-f]{0,6}$/.test(next)) setStop(sel, next.startsWith("#") ? next : `#${next}`);
            }}
          />
          <button
            type="button"
            className="icon"
            title="Move left"
            aria-label="Move stop left"
            disabled={sel === 0}
            onClick={() => {
              const next = colors.slice();
              [next[sel - 1], next[sel]] = [next[sel], next[sel - 1]];
              onChange(next);
              setSelected(sel - 1);
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="icon"
            title="Move right"
            aria-label="Move stop right"
            disabled={sel === colors.length - 1}
            onClick={() => {
              const next = colors.slice();
              [next[sel + 1], next[sel]] = [next[sel], next[sel + 1]];
              onChange(next);
              setSelected(sel + 1);
            }}
          >
            →
          </button>
          <button
            type="button"
            className="icon danger"
            title="Remove stop"
            aria-label="Remove stop"
            disabled={colors.length <= MIN_COLORS}
            onClick={() => onChange(colors.filter((_, j) => j !== sel))}
          >
            ×
          </button>
        </div>
        <div className="row">
          <button
            type="button"
            disabled={colors.length >= MAX_COLORS}
            onClick={() => {
              const next = colors.slice();
              next.splice(sel + 1, 0, colors[sel]);
              onChange(next);
              setSelected(sel + 1);
            }}
          >
            Add stop
          </button>
          <button type="button" onClick={() => onChange(colors.slice().reverse())}>
            Reverse
          </button>
          <button type="button" className="primary" onClick={() => onChange(randomPalette())}>
            Generate
          </button>
        </div>
        <input
          type="text"
          className={pasteError ? "paste invalid" : "paste"}
          placeholder="Paste hex codes or a Coolors link"
          spellCheck={false}
          aria-invalid={pasteError}
          onChange={() => setPasteError(false)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) {
              e.preventDefault();
              paste(text);
              e.currentTarget.value = "";
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              paste(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
        />
        {pasteError ? <p className="note warn">Needs at least two hex colours, like #1a1446 #e0457b.</p> : null}
      </div>

      {PALETTE_GROUPS.map((g) => (
        <section key={g.name} className="preset-group">
          <h3>{g.name}</h3>
          <div className="presets">
            {g.palettes.map((p) => (
              <button
                key={p.name}
                type="button"
                className={p.name === current ? "preset on" : "preset"}
                onClick={() => {
                  onChange(p.colors);
                  setSelected(0);
                }}
                aria-pressed={p.name === current}
              >
                <span className="swatch-bar" style={{ background: ramp(p.colors) }} />
                {p.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
