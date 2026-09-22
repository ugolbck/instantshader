"use client";

// Mounts a STACK: one source (a generator or imported media) plus effect
// layers. ShaderCanvas is this component with a generator source.
//
// Same lifecycle rule as the InstantGradient app's own preview: remount only
// for what the underlying handle can't change in place (seed, a different
// generator shader or media element, background, font). Everything else
// (colors, params, effects, speed, loop, paused) is pushed through the
// StackHandle in its own effect, so object-identity churn on props doesn't
// tear down the canvas.

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactElement } from "react";
import { mountStack } from "instantshader";
import type { EffectLayer, Source, StackHandle } from "instantshader";

export interface ShaderStackProps {
  source: Source;
  /** Effect layers, bottom to top. A new array with the same content does
   * not recompile anything. */
  effects?: EffectLayer[];
  /** Palette. Generators draw with it; effects in "palette" color mode map
   * tone through it. */
  colors: string[];
  /**
   * Setting this prop back to `undefined` does NOT revert playback to the
   * default speed — the underlying handle is only updated when `speed` is
   * not `undefined`, so whatever speed was last applied keeps playing.
   */
  speed?: number;
  seed?: number;
  /** Makes the animation repeat seamlessly every `loopSeconds` animation
   * seconds. Setting it back to `undefined` turns looping off. */
  loopSeconds?: number;
  paused?: boolean;
  /** Shown behind contain-fit media and under media alpha. Mount-time only. */
  background?: string;
  /** CSS font-family for effects that draw text (ASCII). Load it first with
   * `document.fonts.load`. Mount-time only. */
  fontFamily?: string;
  className?: string;
  style?: CSSProperties;
}

function sortedSig(o: Record<string, unknown> | undefined): string {
  if (!o) return "";
  return Object.keys(o).sort().map((k) => `${k}:${String(o[k])}`).join(",");
}

/**
 * Mounts a live stack into a wrapper `<div>`. The canvas fills that div at
 * 100%/100%, so the consumer MUST give the wrapper an explicit size (via
 * `style`, `className`, or a sized parent) — this component does not impose
 * one beyond `position: relative`.
 */
export function ShaderStack({
  source,
  effects,
  colors,
  speed,
  seed,
  loopSeconds,
  paused,
  background,
  fontFamily,
  className,
  style,
}: ShaderStackProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<StackHandle | null>(null);

  // What the source IS (as opposed to its params): changing it remounts.
  const sourceIdentity = source.kind === "generator" ? source.shader : source.media;
  const fit = source.kind === "media" ? source.fit : undefined;

  // Stable signatures of VALUES so effects don't fire on every render just
  // because the caller passed fresh object literals.
  const paramSig = source.kind === "generator" ? sortedSig(source.params) : "";
  const sourceParams = useMemo(
    () => (source.kind === "generator" ? source.params : undefined),
    [paramSig], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const effectSig = (effects ?? [])
    .map((l) => `${l.effect.id}|${l.enabled ?? true}|${sortedSig(l.params)}`)
    .join(";");
  const layers = useMemo(() => effects ?? [], [effectSig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handle = mountStack(container, {
      source,
      effects: layers,
      colors,
      speed,
      seed,
      loopSeconds,
      background,
      fontFamily,
    });
    handleRef.current = handle;
    if (paused) handle.pause();

    return () => {
      handle.dispose();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIdentity, fit, seed, background, fontFamily]);

  useEffect(() => {
    handleRef.current?.setColors(colors);
  }, [colors]);

  useEffect(() => {
    if (sourceParams) handleRef.current?.setSourceParams(sourceParams);
  }, [sourceParams]);

  useEffect(() => {
    handleRef.current?.setEffects(layers);
  }, [layers]);

  useEffect(() => {
    if (speed !== undefined) handleRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    handleRef.current?.setLoopSeconds(loopSeconds);
  }, [loopSeconds]);

  useEffect(() => {
    if (paused) {
      handleRef.current?.pause();
    } else {
      handleRef.current?.resume();
    }
  }, [paused]);

  return <div ref={containerRef} className={className} style={{ position: "relative", ...style }} />;
}
