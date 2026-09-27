![InstantShader](https://raw.githubusercontent.com/ugolbck/instantshader/main/.github/assets/banner.jpg)

# @instantshader/react

React components for [instantshader](https://www.npmjs.com/package/instantshader),
animated WebGL gradients with zero dependencies. Put a shader component in any
sized element, and add dither, pixelate, halftone, ASCII or tint effects over
it or over your own image. Built by
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

One component per shader, all with the same props:

| Component | Look | Params |
| --- | --- | --- |
| `<Flow>` | Swirling fluid currents with bright edges and calm open space. | `scale`, `curl`, `drift`, `openness`, `grain` |
| `<Beam>` | One wide beam of soft light across a near-black frame, the palette running along it. | `scale`, `width`, `glow`, `angle`, `grain` |
| `<Bloom>` | A fan of huge soft petals rising from the bottom edge. | `scale`, `petals`, `pinch`, `bend`, `sway`, `colorflow`, `grain` |
| `<Halo>` | An eclipse: a dark disc with a bright rim and a corona. `x` / `y` place it; the default is a glowing horizon. | `radius`, `x`, `y`, `glow`, `crescent`, `flares`, `grain` |
| `<Strata>` | Stacked cut-paper layers with soft shadows. | `scale`, `layers`, `warp`, `ridges`, `stretch`, `depth`, `blend`, `angle`, `grain` |
| `<Dune>` | Overlapping crests, crisp on top and fading out below. | `layers`, `swell`, `waves`, `fade`, `soft`, `angle`, `grain` |
| `<Whorl>` | A spiral of curved blades, positionable with `x` / `y`. | `blades`, `twist`, `depth`, `scale`, `wobble`, `x`, `y`, `grain` |
| `<Silk>` | Satin folds with a highlight along the threads. | `scale`, `folds`, `depth`, `warp`, `sheen`, `light`, `grain` |
| `<Nacre>` | Glassy liquid folds whose colour shifts on every slope. | `scale`, `flow`, `crease`, `depth`, `iridescence`, `light`, `grain` |
| `<Burst>` | Thin rays out of one point, tunnel or star, straight or twisted. | `rays`, `sharp`, `glow`, `twist`, `x`, `y`, `grain` |
| `<Glint>` | A shoal of spinning shards streaming along a current. | `size`, `density`, `bend`, `angle`, `speed`, `grain` |

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
here as `flow`, `beam`, `bloom`, `halo`, `strata`, `dune`, `whorl`, `silk`,
`nacre`, `burst` and `glint`).

## Effects

Every shader component takes an `effects` prop: a list of layers, bottom
first. Each layer works on everything below it, so effects stack.

```tsx
import { Bloom, dither } from "@instantshader/react";

<Bloom
  colors={["#140f30", "#9c2168", "#eb6a4e", "#fcd87c"]}
  effects={[{ effect: dither, params: { pattern: "blueNoise", colorMode: "palette", levels: 4, blend: "normal", opacity: 1 } }]}
  style={{ width: "100%", height: "100%" }}
/>;
```

`<ShaderStack>` takes a `source` instead of a fixed shader, which is how you
put effects over an image. Any `<img>`, `<canvas>` or `<video>` element works
as `media`:

```tsx
import { ShaderStack, halftone, tint } from "@instantshader/react";

<ShaderStack
  source={{ kind: "media", media: img, fit: "cover" }}
  colors={["#111111", "#f4f1ea"]}
  effects={[
    { effect: halftone, params: { shape: "dot", size: 16 } },
    { effect: tint, params: { mode: "palette", amount: 0.6 } },
  ]}
  style={{ width: "100%", height: "100%" }}
/>;
```

Halftone and ASCII draw shapes or characters over the picture; set `ground:
"paper"` to draw them on a flat colour instead. `blend` and `opacity` set how
any effect mixes with what is below it. A layer with `enabled: false` is
skipped.

Changing `effects` or their params updates the canvas in place. A new
`source`, `seed`, `background` or `fontFamily` remounts it. The five effect
defs (`pixelate`, `dither`, `halftone`, `ascii`, `tint`) are re-exported from here,
and the [repository README](https://github.com/ugolbck/instantshader#effects)
lists every param with its range.

## Seamless loops

Pass `loopSeconds` to make the animation repeat exactly, with no visible seam
at the wrap:

```tsx
<Flow colors={colors} loopSeconds={30} style={{ width: "100%", height: "100%" }} />
```

15 to 60s is the comfortable range, and the period is measured in animation
seconds, so it interacts with `speed`. See the
[`instantshader` README](https://www.npmjs.com/package/instantshader) for the
full details.
