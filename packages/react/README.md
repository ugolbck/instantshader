![InstantShader](https://raw.githubusercontent.com/ugolbck/instantshader/main/.github/assets/banner.jpg)

# @instantshader/react

React bindings for [instantshader](https://www.npmjs.com/package/instantshader), a
zero-dependency animated WebGL gradient engine. Drop a `<Flow>`, `<Beam>`, `<Bloom>`, `<Halo>`, `<Strata>`, `<Dune>` or
`<Whorl>` component into any sized wrapper to mount a live, animated gradient, and
add dither, pixelate, halftone or ASCII effects over it or over your own image.
Built by [InstantGradient](https://instantgradient.com/app).

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
| `<Halo>` | An eclipse disc with a bright limb and flowing corona; `x` / `y` place it, and the default is a glowing horizon arc. | `radius`, `x`, `y`, `glow`, `crescent`, `flares`, `grain` |
| `<Strata>` | Stacked cut-paper layers with soft shadows. | `scale`, `layers`, `warp`, `ridges`, `stretch`, `depth`, `blend`, `angle`, `grain` |
| `<Dune>` | Overlapping crests, crisp on top and airbrushed below. | `layers`, `swell`, `waves`, `fade`, `soft`, `angle`, `grain` |
| `<Whorl>` | A spiral of curved blades, positionable with `x` / `y`. | `blades`, `twist`, `depth`, `scale`, `wobble`, `x`, `y`, `grain` |
| `<Silk>` | Satin folds with a highlight along the threads. | `scale`, `folds`, `depth`, `warp`, `sheen`, `light`, `grain` |
| `<Wisp>` | Molten threads on dark, swelling and thinning, with hot beads. | `scale`, `width`, `stretch`, `angle`, `warp`, `glow`, `sparks`, `grain` |
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
`wisp`, `nacre`, `burst` and `glint`).

## Effects

Every shader component takes an `effects` prop: a list of layers, bottom
first, each an effect def with its params.

```tsx
import { Bloom, dither } from "@instantshader/react";

<Bloom
  colors={["#140f30", "#9c2168", "#eb6a4e", "#fcd87c"]}
  effects={[{ effect: dither, params: { pattern: "blueNoise", colorMode: "palette", levels: 4 } }]}
  style={{ width: "100%", height: "100%" }}
/>;
```

`<ShaderStack>` takes a `source` instead of a fixed shader, which is how you
put effects over an image. Any `<img>`, `<canvas>` or `<video>` element works
as `media`:

```tsx
import { ShaderStack, halftone } from "@instantshader/react";

<ShaderStack
  source={{ kind: "media", media: img, fit: "cover" }}
  colors={["#111111", "#f4f1ea"]}
  effects={[{ effect: halftone, params: { size: 20, angle: 30 } }]}
  style={{ width: "100%", height: "100%" }}
/>;
```

Changing `effects` or their params updates the canvas in place. A new
`source`, `seed`, `background` or `fontFamily` remounts it. The four effect
defs (`pixelate`, `dither`, `halftone`, `ascii`) are re-exported from here,
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
