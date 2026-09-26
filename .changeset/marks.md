---
"instantshader": minor
"@instantshader/react": minor
---

ASCII now draws its characters over the picture, with the same `ground`, `blend`, `opacity`, `blur`, `style`, `exposure`, `contrast` and `density` params as halftone. New defaults: image ground, `colorDodge` at opacity 1, contrast 1.2, size 10, and `cycle: 2` with `cycleAmount: 0.2`. `cycleAmount` is now the share of characters that re-roll each step. `paper` only shows on a paper ground. For the previous look, characters on black, pass `{ ground: "paper", blend: "normal", contrast: 1, size: 24, cycle: 0 }`.

Dither and pixelate take `blend` and `opacity`. `blend: "normal"` with `opacity: 1` gives exactly the old output. Dither's new default is white dots screened over the picture: `screen` at opacity 0.6, and duotone (was source) with ink `#000000` and paper `#ffffff` (were `#111111` and `#f4f1ea`). For the previous look, pass `{ colorMode: "source", blend: "normal", opacity: 1 }`; for the previous duotone, `{ colorMode: "duotone", ink: "#111111", paper: "#f4f1ea", blend: "normal", opacity: 1 }`. Pixelate defaults to size 13 with a thin grid (`gap: 0.08`); pass `{ size: 24, gap: 0 }` for the previous look.

Param sets saved before this release have no `ground`, `blend` or `opacity` (nor ASCII's `contrast`), so those keys take the new defaults and the design looks different. To keep an old design, add the previous-look keys given here and in the halftone note when loading it.

New `tint` effect: a gradient map by brightness, from `dark` to `light` (duotone) or along the palette, faded in by `amount`. It recolours whatever is below it, so it works alone or stacked after any other effect. Exported from both packages.
