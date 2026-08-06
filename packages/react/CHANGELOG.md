# @instantshader/react

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
