---
"instantshader": minor
"@instantshader/react": minor
---

Five new looks: `silk` (satin folds with an anisotropic sheen; matte and grainy at `sheen: 0`), `wisp` (molten threads on dark, swelling and thinning, with hot beads), `nacre` (glassy liquid folds whose colour shifts through the palette on every slope), `burst` (thin grainy rays out of one point, from dark tunnel to white-hot star, straight or twisted) and `glint` (a shoal of spinning shards streaming along a current). React: `<Silk>`, `<Wisp>`, `<Nacre>`, `<Burst>`, `<Glint>`.

Halftone defaults changed to what reads well at a fine pitch: size 10, radius 1.4, softness 0.1, contrast 1.15, palette colours. In palette mode, halftone and ASCII now colour each dot or glyph with the nearest palette stop, flat; over a shader they used to hand back the source colour and looked identical to source mode.
