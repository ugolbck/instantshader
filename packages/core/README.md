![InstantShader](https://raw.githubusercontent.com/ugolbck/instantshader/main/.github/assets/banner.jpg)

# instantshader

Animated WebGL gradient shaders with zero dependencies. Mount a live gradient
into any element, draw dither, pixelate, halftone, ASCII or tint effects over
it or over your own image, or render single frames for export. Built by
[InstantGradient](https://instantgradient.com/app).

## Install

```bash
npm install instantshader
```

## Usage

```ts
import { mountGradient, flow } from "instantshader";

const handle = mountGradient(document.getElementById("bg")!, {
  shader: flow,
  colors: ["#4f46e5", "#ec4899", "#22d3ee"],
});

// handle.pause() / handle.resume() / handle.dispose() when done
```

## Shaders

Each shader is a separate named export, so the ones you don't import
tree-shake away.

| Shader | Look | Params |
| --- | --- | --- |
| `flow` | Swirling fluid currents. Colour masses travel in soft eddies with bright edges and calm open space between them. | `scale`, `curl`, `drift`, `openness`, `grain` |
| `beam` | One wide beam of soft light across a near-black frame. The palette runs along the beam, with thin brighter filaments inside it. | `scale`, `width`, `glow`, `angle`, `grain` |
| `bloom` | A fan of huge soft petals rising from the bottom edge. The palette forms scalloped bands from a hot core out to a dark background, with thin creases between the petals. | `scale`, `petals`, `pinch`, `bend`, `sway`, `colorflow`, `grain` |
| `halo` | An eclipse: a dark disc with a bright rim and a corona of streamers, the palette wrapped around the ring. `x` / `y` place the disc; the default sinks it below the frame for a glowing horizon. | `radius`, `x`, `y`, `glow`, `crescent`, `flares`, `grain` |
| `strata` | Stacked cut-paper sheets, one per palette step, each casting a soft shadow on the one below. `ridges` and `stretch` turn round islands into spines or long bands. | `scale`, `layers`, `warp`, `ridges`, `stretch`, `depth`, `blend`, `angle`, `grain` |
| `dune` | Overlapping crests rolling across the frame. Each has a crisp top edge and fades out below it. | `layers`, `swell`, `waves`, `fade`, `soft`, `angle`, `grain` |
| `whorl` | A spiral of curved blades, each with a sharp leading edge and a soft fade behind it. `x` / `y` place the centre anywhere, including off-frame. | `blades`, `twist`, `depth`, `scale`, `wobble`, `x`, `y`, `grain` |
| `silk` | Satin folds lit from one side, with a sheen that streaks along the threads. | `scale`, `folds`, `depth`, `warp`, `sheen`, `light`, `grain` |
| `nacre` | Glassy liquid folds whose colour shifts to the neighbouring palette colours on every slope, like mother of pearl. | `scale`, `flow`, `crease`, `depth`, `iridescence`, `light`, `grain` |
| `burst` | Thin grainy rays out of one point, from a dark tunnel to a white-hot star, straight or twisted into a pinwheel. | `rays`, `sharp`, `glow`, `twist`, `x`, `y`, `grain` |
| `glint` | Small spinning shards streaming along a curved current on dark, each edge fringed with colour. | `size`, `density`, `bend`, `angle`, `speed`, `grain` |

Previews of every look, with full param ranges, are in the
[repository README](https://github.com/ugolbck/instantshader#readme).

Every shader takes the same mount options; `params` is where they differ:

```ts
import { mountGradient, bloom } from "instantshader";

mountGradient(el, {
  shader: bloom,
  colors: ["#ffd9e8", "#ffb300", "#ff8fc0", "#3d7bff", "#0a2e14"],
  // bloom has two independent motion modes: petals that breathe and lean,
  // and colours that travel outward through a still pattern. Mix freely.
  params: { sway: 0.5, colorflow: 0.4 },
});
```

Ranges, defaults and labels are all discoverable at runtime. `shader.params`
is an array of `ParamDef`, and `shader.randomParams(rand)` produces a full,
sensible param set for "randomize" flows. `shaders` and `getShader(id)` expose
the whole registry (importing either pulls every shader).

## Effects

An effect redraws a picture: a shader's output, or an image, canvas or video
frame you supply. Five are included: `pixelate`, `dither`, `halftone`,
`ascii` and `tint`.

- Halftone and ASCII draw shapes or characters over the picture. `ground`
  picks what is under them: the picture, or a flat `paper` colour.
- `blend` (`normal`, `multiply`, `screen`, `overlay`, `softLight`,
  `colorDodge`) and `opacity` set how an effect mixes with what is below.
  Pixelate and dither at `blend: "normal"` and `opacity: 1` replace the
  picture.
- Tint recolours whatever is below it by brightness, in two colours or along
  the palette.

```ts
import { mountStack, bloom, dither } from "instantshader";

mountStack(el, {
  source: { kind: "generator", shader: bloom },
  colors: ["#140f30", "#9c2168", "#eb6a4e", "#fcd87c"],
  effects: [{ effect: dither, params: { pattern: "blueNoise", colorMode: "palette", levels: 4, blend: "normal", opacity: 1 } }],
  loopSeconds: 30,
});
```

For an image, the source is `{ kind: "media", media: img }` with an optional
`fit` of `"cover"` (default) or `"contain"`. `effects` is a list, bottom
layer first, and each effect works on everything below it:

```ts
effects: [
  { effect: halftone, params: { shape: "dot", size: 16 } },
  { effect: tint, params: { mode: "palette", amount: 0.6 } },
],
```

A layer with `enabled: false` is skipped. `mountStack` returns the `mountGradient` handle plus
`setSource`, `setSourceParams`, `setEffects`, `setEffectParams(index, params)`,
`refreshMedia()` and `getGridInfo()`. `renderStackFrame` renders one frame to
a detached canvas and `createStackRenderer` is the seekable renderer for
video export, both with the same options.

Each effect's `params` array describes its controls the way `shader.params`
does, with four kinds: float, enum (a string value from `options`), bool and
colour (a `#rrggbb` string). A `when` field on a param says which other
param's value makes it relevant, for building UI. `effects` and
`getEffect(id)` expose the registry, and importing either pulls every effect.

Effect sizes are in pixels at 1080p, and each effect computes one value per
cell into a buffer that is the same at every output size, so a preview and a
4K export contain identical cells. The [repository
README](https://github.com/ugolbck/instantshader#effects) has images, every
param with its range, and the details of how preview and export line up.

## Seamless loops

Set `loopSeconds` and the animation repeats exactly, with no visible seam at
the wrap. The frame at `t` and at `t + loopSeconds` are identical pixel for
pixel. Built for video export and for backgrounds that must not betray a
restart.

```ts
mountGradient(el, { shader: flow, colors, loopSeconds: 30 });
```

It works the same on the one-shot renderer, which is how you'd drive an
encoder:

```ts
const LOOP = 20;
for (let frame = 0; frame < 30 * LOOP; frame++) {
  const { canvas, dispose } = renderGradientFrame({
    shader: flow,
    colors,
    loopSeconds: LOOP,
    timeMs: (frame / 30) * 1000,
    width: 1920,
    height: 1080,
  });
  // ...encode canvas, then:
  dispose();
}
```

Notes:

- The period is measured in **animation** seconds, so it interacts with
  `speed`: a 90s loop at `speed: 4` completes in 22.5 wall-clock seconds while
  still containing 90 seconds of motion. That pairing is how you get a short,
  light video file without slowing the animation down.
- **`flow` ties its travel speed to the loop length.** It animates by
  translating in a straight line through a noise field that tiles, and it
  covers exactly one tile per cycle, so a short loop flows fast and a long
  one flows slowly. The hand-tuned drift rate corresponds to a period around
  60 to 90s; below ~30s the currents move noticeably faster than the look was
  designed for. Compensate with `speed` rather than by shortening the loop.
- **`beam` freezes its width swell below ~29s.** Its natural cycle is ~57s and
  cannot be squeezed into a short loop without becoming a throb, so under that
  threshold the swell holds still instead. Everything else still animates.
- **`bloom` sheds parts of its sway on short loops.** Its `sway` is several
  slow oscillations (petal breathing ~20s, fan lean ~30s, petal flex ~42s)
  layered over a noise wander. Each oscillation holds still once the loop is
  shorter than about half its own period, so below ~10s the wander is the only
  thing left moving. `colorflow` is unaffected. It always fits at least one
  full cycle into the loop, flowing faster on a short one.
- `halo`, `dune` and `whorl` always complete at least one full cycle of
  their main motion per loop, so a short loop simply runs them faster.
  `burst` never turns; its rays stream outward one tile per loop. `glint`
  travels one pattern period per loop, half a period under 12 s.
- Any loop necessarily revisits the same state every N seconds; a long period
  is what buys the impression of never repeating.
