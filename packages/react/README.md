# @instantshader/react

React bindings for [instantshader](https://www.npmjs.com/package/instantshader), a
zero-dependency animated WebGL gradient engine. Drop a `<Flow>`, `<Beam>` or
`<Bloom>` component into any sized wrapper to mount a live, animated gradient. Built by
[InstantGradient](https://instantgradient.com/app).

## Install

```bash
npm install @instantshader/react
```

## Usage

```tsx
import { Flow } from "@instantshader/react";

export function Background() {
  return (
    <Flow
      colors={["#4f46e5", "#ec4899", "#22d3ee"]}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
```

## Shaders

One component per shader, each a thin wrapper over the same props:

| Component | Look | Params |
| --- | --- | --- |
| `<Flow>` | Isotropic swirling currents with defined luminous edges and calm negative space. | `scale`, `curl`, `drift`, `openness`, `grain` |
| `<Beam>` | One wide beam of soft light crossing a near-black frame, the palette walking its length. | `scale`, `width`, `glow`, `angle`, `grain` |
| `<Bloom>` | A fan of huge soft petals radiating from the bottom edge, palette as concentric scalloped bands. | `scale`, `petals`, `pinch`, `bend`, `sway`, `colorflow`, `grain` |

```tsx
import { Bloom } from "@instantshader/react";

<Bloom
  colors={["#ffd9e8", "#ffb300", "#ff8fc0", "#3d7bff", "#0a2e14"]}
  // bloom has two independent motion modes: petals that breathe and lean,
  // and colours that travel outward through a still pattern.
  params={{ sway: 0.5, colorflow: 0.4 }}
  style={{ width: "100%", height: "100%" }}
/>;
```

See the [`instantshader` README](https://www.npmjs.com/package/instantshader)
for what each param does and for the shader defs themselves (re-exported from
here as `flow`, `beam` and `bloom`).

## Seamless loops

Pass `loopSeconds` to make the animation repeat exactly, with no visible seam
at the wrap:

```tsx
<Flow colors={colors} loopSeconds={30} style={{ width: "100%", height: "100%" }} />
```

15–60s is the comfortable range, and the period is measured in animation
seconds (so it interacts with `speed`). See the
[`instantshader` README](https://www.npmjs.com/package/instantshader) for the
full details.
