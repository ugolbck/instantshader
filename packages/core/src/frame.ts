import type { EffectLayer, RenderFrameResult, ShaderDef, Source } from "./types";
import { createStackRenderer } from "./stack";

/**
 * Renders a single frame of a stack (a source plus effect layers) into a
 * detached (not-in-DOM) canvas at an exact pixel size, for export/thumbnail
 * use cases that need a synchronous snapshot rather than a live animation.
 *
 * The returned canvas is NOT disposed automatically — its GL context must
 * stay alive after this function returns so callers can scrape pixels from
 * it (toDataURL/toBlob/getImageData/drawImage). Once the caller is done
 * with it, release the GL context by calling the returned `dispose()`.
 */
export function renderStackFrame(opts: {
  source: Source;
  effects?: EffectLayer[];
  colors: string[];
  seed?: number;
  timeMs?: number;
  /** See MountOptions.loopSeconds. */
  loopSeconds?: number;
  background?: string;
  fontFamily?: string;
  width: number;
  height: number;
}): RenderFrameResult {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;

  const renderer = createStackRenderer({
    canvas,
    source: opts.source,
    effects: opts.effects,
    colors: opts.colors,
    seed: opts.seed ?? 0,
    loopSeconds: opts.loopSeconds,
    background: opts.background,
    fontFamily: opts.fontFamily,
  });

  renderer.renderAt(opts.timeMs ?? 0);

  // WebGL draw calls are asynchronous by default: without forcing a sync
  // point here, a caller that immediately does canvas.toDataURL() or
  // drawImage() right after this function returns could race the GPU and
  // read an incomplete frame. A 1x1 readPixels is the standard portable
  // sync-point poke — it blocks until this draw has actually completed.
  const gl = canvas.getContext("webgl");
  if (gl) {
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  }

  return { canvas, dispose: renderer.dispose };
}

/** renderStackFrame() for the common case of one generator and no effects. */
export function renderGradientFrame(opts: {
  shader: ShaderDef;
  colors: string[];
  params?: Record<string, number>;
  seed?: number;
  timeMs?: number;
  /** Seamless-loop period in animation seconds. Only meaningful here in that
   * it makes `timeMs` and `timeMs + loopSeconds * 1000` render the same
   * frame — which is exactly how a loop is verified. See
   * MountOptions.loopSeconds. */
  loopSeconds?: number;
  width: number;
  height: number;
}): RenderFrameResult {
  return renderStackFrame({
    source: { kind: "generator", shader: opts.shader, params: opts.params },
    colors: opts.colors,
    seed: opts.seed,
    timeMs: opts.timeMs,
    loopSeconds: opts.loopSeconds,
    width: opts.width,
    height: opts.height,
  });
}
