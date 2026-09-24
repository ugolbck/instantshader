---
"instantshader": minor
"@instantshader/react": minor
---

New look: `silk`, satin folds lit from one side with an anisotropic sheen along the threads (React: `<Silk>`). Halftone defaults changed to what reads well at a fine pitch: size 10, radius 1.4, softness 0.1, contrast 1.15, palette colours. In palette mode, halftone and ASCII now colour each dot or glyph with the nearest palette stop, flat; over a shader they used to hand back the source colour and looked identical to source mode.
