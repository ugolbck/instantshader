---
"instantshader": minor
"@instantshader/react": minor
---

Four new looks: `silk` (satin folds with an anisotropic sheen; matte and grainy at `sheen: 0`), `nacre` (glassy liquid folds whose colour shifts through the palette on every slope), `burst` (thin grainy rays out of one point, from dark tunnel to white-hot star, straight or twisted) and `glint` (a shoal of spinning shards streaming along a current). React: `<Silk>`, `<Nacre>`, `<Burst>`, `<Glint>`.

Halftone now draws over the picture instead of replacing it. New params: `ground` (`image`, the default, keeps the picture visible between the shapes; `paper` is the old shapes-on-a-sheet look), `blend` (`normal`, `multiply`, `screen`, `overlay`, `softLight`, the CSS blend modes) and `opacity`. Screened shapes grow in the brights, every other blend grows them in the darks. New defaults: screen, diamonds (`shape: square` at 45°), size 20, radius 0.75, source colours. For the previous look, pass `{ ground: "paper", blend: "normal" }`. In palette mode, halftone and ASCII now colour each dot or glyph with the nearest palette stop, flat; over a shader they used to hand back the source colour and looked identical to source mode.
