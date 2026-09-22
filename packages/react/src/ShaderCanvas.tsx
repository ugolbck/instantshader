"use client";

import type { ReactElement } from "react";
import type { EffectLayer, ShaderDef } from "instantshader";
import { ShaderStack } from "./ShaderStack";
import type { ShaderStackProps } from "./ShaderStack";

export interface ShaderCanvasProps extends Omit<ShaderStackProps, "source" | "effects" | "background"> {
  shader: ShaderDef;
  /**
   * Merged into the shader's current params (removed/omitted keys are NOT
   * reset to their default — they keep whatever value was last applied).
   * Setting this prop back to `undefined` does not revert to defaults
   * either: the underlying handle is only updated when `params` is truthy,
   * so the last applied values simply stick.
   */
  params?: Record<string, number>;
  /** Effect layers drawn over the gradient, bottom to top:
   * `[{ effect: dither, params: { size: 4, colorMode: "palette" } }]`. */
  effects?: EffectLayer[];
}

/**
 * Mounts a live InstantShader gradient, optionally with effects over it. See
 * ShaderStack for sizing: the consumer MUST give the wrapper an explicit size.
 * Remounts only when `shader` or `seed` changes.
 */
export function ShaderCanvas({ shader, params, effects, ...rest }: ShaderCanvasProps): ReactElement {
  return <ShaderStack source={{ kind: "generator", shader, params }} effects={effects} {...rest} />;
}
