import { useEffect, useState } from "react";
import { renderStackFrame, shaders, type ShaderDef } from "instantshader";

// Each look as a thumbnail rendered in the current palette, so picking a look
// shows what it will do to these colours rather than to some demo palette.
// Rendered one per task, after a short pause once the colours settle, so
// dragging a colour picker never stalls on eleven GL contexts.

const W = 192;
const H = 108;

function thumbnail(shader: ShaderDef, colors: string[], seed: number): string {
  const { canvas, dispose } = renderStackFrame({
    source: { kind: "generator", shader },
    colors,
    seed,
    timeMs: 2500,
    width: W,
    height: H,
  });
  try {
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    dispose();
  }
}

export function ShaderPicker({
  colors,
  seed,
  value,
  imageActive,
  onPick,
  onPickImage,
}: {
  colors: string[];
  seed: number;
  value: string;
  imageActive: boolean;
  onPick: (id: string) => void;
  onPickImage: () => void;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = `${colors.join(",")}|${seed}`;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const s of shaders) {
        if (cancelled) return;
        const url = thumbnail(s, colors, seed);
        setThumbs((prev) => ({ ...prev, [s.id]: url }));
        await new Promise((r) => setTimeout(r, 0));
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="looks" role="listbox" aria-label="Look">
      {shaders.map((s) => {
        const on = !imageActive && s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={on}
            className={on ? "look on" : "look"}
            onClick={() => onPick(s.id)}
            style={thumbs[s.id] ? { backgroundImage: `url(${thumbs[s.id]})` } : undefined}
          >
            <span>{s.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        role="option"
        aria-selected={imageActive}
        className={imageActive ? "look image on" : "look image"}
        onClick={onPickImage}
      >
        <span>Your image</span>
      </button>
    </div>
  );
}
