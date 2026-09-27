import { useEffect, useRef } from "react";
import { mountStack, renderStackFrame, type EffectLayer, type GridInfo, type Source, type StackHandle } from "instantshader";

/** The live canvas, filling the viewport behind the panel. Split out so a
 * colour or param tweak runs only the cheap handle setter rather than
 * remounting the GL context.
 *
 * `compare` pauses playback, renders the same stack at 3840px wide at the
 * same instant, and lays that export over the right half of the preview: the
 * seam down the middle should be invisible. */
export function Stage({
  source,
  layers,
  colors,
  params,
  seed,
  speed,
  playing,
  loopSeconds,
  compare,
  onHandle,
  onGridInfo,
}: {
  source: Source;
  layers: EffectLayer[];
  colors: string[];
  params: Record<string, number>;
  seed: number;
  speed: number;
  playing: boolean;
  loopSeconds: number | undefined;
  compare: boolean;
  onHandle: (handle: StackHandle | null) => void;
  onGridInfo: (info: GridInfo[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<StackHandle | null>(null);
  const identity = source.kind === "generator" ? source.shader : source.media;
  const fullSource: Source = source.kind === "generator" ? { ...source, params } : source;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = mountStack(container, { source: fullSource, effects: layers, colors, seed, speed, loopSeconds });
    handleRef.current = handle;
    if (!playing) handle.pause();
    onHandle(handle);
    onGridInfo(handle.getGridInfo());
    // Exposed for screenshot scripts.
    (window as unknown as { __stack?: StackHandle }).__stack = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
      onHandle(null);
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

  const layerSig = JSON.stringify(layers.map((l) => [l.effect.id, l.params, l.enabled]));
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setEffects(layers);
    onGridInfo(handle.getGridInfo());
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
    if (!handle || compare) return;
    if (playing) handle.resume();
    else handle.pause();
  }, [playing, compare]);

  useEffect(() => {
    const handle = handleRef.current;
    const holder = exportRef.current;
    if (!handle || !holder || !compare) return;
    handle.pause();
    const { canvas } = handle;
    const width = 3840;
    const height = Math.round((width * canvas.height) / canvas.width);
    const frame = renderStackFrame({
      source: fullSource,
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
      if (playing) handleRef.current?.resume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, layerSig, paramSig, colorSig, identity, seed, loopSeconds]);

  return (
    <>
      <div ref={containerRef} className="stage" />
      <div ref={exportRef} className="stage export" hidden={!compare} />
      {compare ? (
        <div className="compare-labels" aria-hidden>
          <span>Preview</span>
          <span>4K export</span>
        </div>
      ) : null}
    </>
  );
}
