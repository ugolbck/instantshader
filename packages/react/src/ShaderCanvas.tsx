"use client";

// Mirrors the mount lifecycle of lib/editor/providers/kit/createKitProvider.tsx's
// Preview component in the InstantGradient app (read-only reference, not
// imported from here): remount only on shader/seed change, everything else
// (colors/params/speed/paused) pushed through the MountHandle in its own
// effect so object-identity churn on `params` doesn't tear down the canvas.

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactElement } from "react";
import { mountGradient } from "instantshader";
import type { MountHandle, ShaderDef } from "instantshader";

export interface ShaderCanvasProps {
  shader: ShaderDef;
  colors: string[];
  params?: Record<string, number>;
  speed?: number;
  seed?: number;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Mounts a live InstantShader gradient into a wrapper `<div>`. The canvas
 * fills that div at 100%/100% (mountGradient styles it that way), so the
 * consumer MUST give the wrapper an explicit size (via `style`, `className`,
 * or a sized parent) — this component does not impose one beyond
 * `position: relative`.
 */
export function ShaderCanvas({
  shader,
  colors,
  params,
  speed,
  seed,
  paused,
  className,
  style,
}: ShaderCanvasProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MountHandle | null>(null);

  // Stable signature of the params VALUES so the params effect doesn't fire
  // on every render just because the caller passed a fresh object literal.
  const paramSig = params ? Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}:${v}`).join(",") : "";
  const p = useMemo(() => params, [paramSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount/remount only on shader or seed change — both are mount-time-only
  // options for the underlying handle. Colors/params/speed/paused all flow
  // through the handle without tearing down the canvas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handle = mountGradient(container, {
      shader,
      colors,
      params: p,
      speed,
      seed,
    });
    handleRef.current = handle;
    if (paused) handle.pause();

    return () => {
      handle.dispose();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shader, seed]);

  useEffect(() => {
    handleRef.current?.setColors(colors);
  }, [colors]);

  useEffect(() => {
    if (p) handleRef.current?.setParams(p);
  }, [p]);

  useEffect(() => {
    if (speed !== undefined) handleRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    if (paused) {
      handleRef.current?.pause();
    } else {
      handleRef.current?.resume();
    }
  }, [paused]);

  return <div ref={containerRef} className={className} style={{ position: "relative", ...style }} />;
}
