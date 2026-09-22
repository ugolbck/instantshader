import type { EffectDef } from "./types";
import { pixelate } from "./effects/pixelate";
import { dither } from "./effects/dither";
import { halftone } from "./effects/halftone";
import { ascii } from "./effects/ascii";

// Same deal as registry.ts: order carries no meaning for consumers.
export const effects: readonly EffectDef[] = [pixelate, dither, halftone, ascii];

export function getEffect(id: string): EffectDef | undefined {
  return effects.find((e) => e.id === id);
}
