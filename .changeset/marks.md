---
"instantshader": minor
"@instantshader/react": minor
---

ASCII now draws its characters over the picture, with the same `ground`, `blend`, `opacity`, `blur`, `style`, `exposure`, `contrast` and `density` params as halftone. New defaults: image ground, `colorDodge` at opacity 1, contrast 1.2, size 10, and `cycle: 2` with `cycleAmount: 0.2`. `cycleAmount` is now the share of characters that re-roll each step. `paper` only shows on a paper ground. For the previous look, characters on black, pass `{ ground: "paper", blend: "normal" }`, plus `size: 24, cycle: 0` for the old size and no flicker.

Dither and pixelate take `blend` and `opacity`. `blend: "normal"` with `opacity: 1` gives exactly the old output. Dither's new default is white dots screened over the picture: duotone with black ink and white paper, `screen`, opacity 0.6. For the previous look, pass `{ colorMode: "source", blend: "normal", opacity: 1 }`. Pixelate defaults to size 13 with a thin grid (`gap: 0.08`); pass `{ size: 24, gap: 0 }` for the previous look.

New `tint` effect: a gradient map by brightness, from `dark` to `light` (duotone) or along the palette, faded in by `amount`. It recolours whatever is below it, so it works alone or stacked after any other effect. Exported from both packages.
