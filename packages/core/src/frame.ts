import type { RenderFrameResult, ShaderDef } from "./types";
import { createRenderer } from "./renderer";
import { resolveParams } from "./params";

/**
 * Renders a single frame into a detached (not-in-DOM) canvas at an exact
 * pixel size, for export/thumbnail use cases that need a synchronous
 * snapshot rather than a live animation.
 *
 * The returned canvas is NOT disposed automatically — its GL context must
 * stay alive after this function returns so callers can scrape pixels from
 * it (toDataURL/toBlob/getImageData/drawImage). Once the caller is done
 * with it, release the GL context by calling the returned `dispose()`.
 */
export function renderGradientFrame(opts: {
  shader: ShaderDef;
  colors: string[];
  params?: Record<string, number>;
  seed?: number;
  timeMs?: number;
  width: number;
  height: number;
}): RenderFrameResult {
  const def = opts.shader;

  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;

  const renderer = createRenderer({
    canvas,
    shader: def,
    colors: opts.colors,
    params: resolveParams(def, opts.params),
    seed: opts.seed ?? 0,
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
