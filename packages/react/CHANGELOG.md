# @instantshader/react

## 0.2.0

### Minor Changes

- 80602fd: Add `loopSeconds` for seamless looping.

  Set it and the animation repeats exactly, with no visible seam at the wrap —
  the frame at `t` and at `t + loopSeconds` are identical pixel for pixel, which
  is what a video encoder needs. Available on `mountGradient`,
  `renderGradientFrame`, `createRenderer`, and as a `loopSeconds` prop on
  `<ShaderCanvas>` / `<Flow>` / `<Beam>`; `MountHandle` gains `setLoopSeconds()`.

  Two strategies, because a loop can be hidden in two different ways. `beam`
  bends its walk through the noise field into a closed circle of the same arc
  length (`loopDrift`), which suits a beam that sways. `flow` instead travels in
  a permanently straight line through a field that TILES, covering exactly one
  tile per cycle (`loopTravel` + a new periodic-Perlin `pnoise`), because a
  rotating drift direction reads as the composition swaying back and forth
  rather than flowing. Both plus `loopFreq` live in the shared GLSL preamble, so
  future shaders inherit looping by routing their time dependence through them.
  The shader clock also wraps at the period, which is what makes the film-grain
  hash land on identical values at t=0 and t=period.

  Two consequences worth knowing:

  - `flow`'s curl potential is now periodic Perlin rather than simplex, in
    looping and non-looping modes alike, so its motion differs slightly from
    0.1.0 even with `loopSeconds` omitted. The fbm that paints the colour masses
    is untouched, so the look itself is preserved.
  - `flow`'s travel speed is now tied to the loop length (one tile per cycle):
    short loops flow fast, long ones slowly. Around 60–90s matches the
    hand-tuned rate; pair it with `speed` to still land a short file.

### Patch Changes

- Updated dependencies [80602fd]
  - instantshader@0.2.0

## 0.1.0

### Minor Changes

- Initial public release.

  - `instantshader`: zero-dependency WebGL gradient engine. `mountGradient()` for a
    live, resizable, pausable gradient in any DOM element; `renderGradientFrame()`
    for a one-shot detached canvas; `createRenderer()` as the seekable low-level
    escape hatch for export pipelines. Ships the `flow` and `beam` shaders, an
    OKLCh-interpolated palette ramp, and resolution-independent pattern density.
  - `@instantshader/react`: `<ShaderCanvas>` plus `<Flow>` / `<Beam>` bindings.
    Colors, params, speed and paused state update through the mount handle without
    tearing down the canvas.

### Patch Changes

- Updated dependencies
  - instantshader@0.1.0
