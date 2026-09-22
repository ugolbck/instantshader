---
"instantshader": minor
"@instantshader/react": minor
---

Effects: shaders that redraw an existing picture, over a gradient or over your
own image.

- Four effects: `pixelate`, `dither` (Bayer 2/4/8 and blue noise), `halftone`
  (dots, lines, squares, square or hex grid, any angle) and `ascii`. Each has
  its own params and optional loop-safe motion (`shimmer`, `pulse`, `cycle`).
- Color modes on dither, halftone and ASCII: keep the source colors, two-color
  ink and paper, or map through the palette. Palette mode over a gradient keeps
  the gradient's own color layout and outputs only palette stops.
- The export matches the preview. Effect sizes are in pixels at 1080p and every
  effect computes one value per cell into a buffer that is the same at every
  output size, so a small preview and a 3840x2160 export contain identical
  cells. 1080p-class and 4K-class exports are pixel-exact; the preview is the
  export downscaled in linear light.
- New API: `createStackRenderer`, `mountStack`, `renderStackFrame`, `effects`,
  `getEffect`, `gridFor`. A stack is one source (a generator, or any image,
  canvas or video frame) plus effect layers. `createRenderer`,
  `mountGradient` and `renderGradientFrame` are unchanged and now run on it.
- React: an `effects` prop on every shader component and on `ShaderCanvas`,
  plus `<ShaderStack>` for media sources.
- The mounted canvas is now sized from the element's device-pixel box where
  the browser reports one, which removes the one-pixel mismatch (and the moire
  it causes on fine patterns) at fractional zoom levels.
