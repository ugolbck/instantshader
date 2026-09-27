---
"instantshader": patch
"@instantshader/react": patch
---

Dither's defaults change to an 8x8 Bayer pattern, size 3, four levels, thresholded in linear light, in the picture's own colours, soft-lit over the picture at opacity 0.6. For the 0.8.0 default, pass `{ pattern: "bayer4", size: 4, levels: 2, linear: false, colorMode: "duotone", blend: "screen" }`.
