// The original single-shader renderer, now a zero-layer stack. All GL lives
// in stack.ts; this file keeps the createRenderer() contract that export
// pipelines were written against.
//
// Zero dependencies on anything outside this package by design — see
// palette.ts for why.

import type { RendererOptions } from "./types";
import { createStackRenderer } from "./stack";

export { BASE_UNIFORMS } from "./preamble";

export type Renderer = {
  renderAt(timeMs: number): void;
  setColors(colors: string[]): void;
  setParams(params: Record<string, number>): void;
  /** Sets the seamless-loop period in animation seconds; 0/undefined disables
   * looping. See RendererOptions.loopSeconds. */
  setLoopSeconds(seconds: number | undefined): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

export function createRenderer(opts: RendererOptions): Renderer {
  const stack = createStackRenderer({
    canvas: opts.canvas,
    source: { kind: "generator", shader: opts.shader, params: opts.params },
    colors: opts.colors,
    seed: opts.seed,
    loopSeconds: opts.loopSeconds,
  });
  return {
    renderAt: stack.renderAt,
    setColors: stack.setColors,
    setParams: stack.setSourceParams,
    setLoopSeconds: stack.setLoopSeconds,
    resize: stack.resize,
    dispose: stack.dispose,
  };
}
