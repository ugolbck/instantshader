---
"instantshader": minor
"@instantshader/react": minor
---

Effects now draw over the picture instead of replacing it, and they stack.

**Halftone** draws its shapes over the picture. New params: `ground` (`image`, the default, or `paper` for shapes on a flat colour), `blend` (`normal`, `multiply`, `screen`, `overlay`, `softLight`, `colorDodge`), `opacity`, `blur` (blurs the picture behind the shapes), `style` (`filled` sizes shapes by tone, `uniform` makes them one size), `exposure` and `density` (the share of cells that get a shape). Over the picture, shapes run from nothing to full size, and in `source` colours each shape is a brighter version of the colour under it. On an image ground, `multiply` grows shapes in the dark areas and every other blend in the bright ones; on paper they grow away from the paper colour; `invert` flips it. `pulse` is removed. New defaults: screen, `shape: "square"` at 45°, size 20, radius 0.75, source colours. For the 0.7.0 look, pass `{ ground: "paper", blend: "normal", shape: "dot", size: 10, radius: 1.4, colorMode: "palette" }`.

**ASCII** draws its characters over the picture, with the same `ground`, `blend`, `opacity`, `blur`, `style`, `exposure`, `contrast` and `density` params. New defaults: `colorDodge` at opacity 1, contrast 1.2, size 10, and `cycle: 2` with `cycleAmount: 0.2`. `cycleAmount` is now the share of characters that re-roll each step, so small values flicker instead of doing nothing. For the previous look, characters on black, pass `{ ground: "paper", blend: "normal", contrast: 1, size: 24, cycle: 0 }`.

**Dither and pixelate** take `blend` and `opacity`; `blend: "normal"` with `opacity: 1` gives exactly the old output. Dither's new default is white dots screened over the picture: duotone (was source) with ink `#000000` and paper `#ffffff` (were `#111111` and `#f4f1ea`), `screen` at opacity 0.6. For the previous look, pass `{ colorMode: "source", blend: "normal", opacity: 1 }`. Pixelate defaults to size 13 with thin grid lines (`gap: 0.08`); pass `{ size: 24, gap: 0 }` for the previous look.

**Tint** is a new effect: it recolours whatever is below it by brightness, from `dark` to `light` or along the palette, faded in by `amount`.

Layers take `enabled: false` to switch off without being removed.

Param sets saved before this release have no `ground`, `blend` or `opacity` (nor ASCII's `contrast`), so they render with the new defaults. To keep an old design, add the previous-look keys above when loading it.

Shader defaults: `beam` has `scale: 0.75` and `width: 0.4` (were 1 and 0.14), and `whorl` has `wobble: 0` (was 0.4).
