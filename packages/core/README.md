![InstantShader](https://raw.githubusercontent.com/ugolbck/instantshader/main/.github/assets/banner.jpg)

# instantshader

Animated WebGL gradient shaders with zero dependencies. Mount a live, resizable
gradient into any DOM element, or render a single frame to a detached canvas
for export pipelines. Built by [InstantGradient](https://instantgradient.com/app).

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
| `flow` | Isotropic swirling currents. A curl-noise field advects the sample point before it hits fbm, so colour masses travel in continuous, fluid-like eddies with defined luminous edges and generous calm negative space. | `scale`, `curl`, `drift`, `openness`, `grain` |
| `beam` | One wide beam of soft light crossing a near-black frame. The palette walks the beam's length, thin brighter filaments crawl inside it, and most of the frame is dark negative space. | `scale`, `width`, `glow`, `angle`, `grain` |
| `bloom` | A fan of huge, ultra-soft petals radiating from the frame's bottom edge. One analytic rose-curve field, so the palette reads as concentric scalloped bands from a hot core out to a dark background, with thin dark creases between the petals. | `scale`, `petals`, `pinch`, `bend`, `sway`, `colorflow`, `grain` |
| `halo` | An eclipse: one dark disc with a razor-bright limb and a corona of streamers flowing outward, the palette wrapped around the ring. `x` / `y` place the disc; the default sinks it below the frame for a glowing horizon arc. | `radius`, `x`, `y`, `glow`, `crescent`, `flares`, `grain` |
| `strata` | Stacked cut-paper sheets, one per palette step, each casting a soft shadow on the one below. `ridges` and `stretch` reshape the relief itself, from round islands to branching spines to long agate bands. | `scale`, `layers`, `warp`, `ridges`, `stretch`, `depth`, `blend`, `angle`, `grain` |
| `dune` | Overlapping crests rolling across the frame, back to front. Each has one crisp top edge and airbrushes away below it; neighbouring crests slide against each other. | `layers`, `swell`, `waves`, `fade`, `soft`, `angle`, `grain` |
| `whorl` | A logarithmic spiral of curved blades, each with one sharp leading edge and a soft fade behind it. `x` / `y` place the centre anywhere, including off-frame. | `blades`, `twist`, `depth`, `scale`, `wobble`, `x`, `y`, `grain` |

Previews of every look, with full param ranges, are in the
[repository README](https://github.com/ugolbck/instantshader#readme).

Every shader takes the same mount options; `params` is where they differ:

```ts
import { mountGradient, bloom } from "instantshader";

mountGradient(el, {
  shader: bloom,
  colors: ["#ffd9e8", "#ffb300", "#ff8fc0", "#3d7bff", "#0a2e14"],
  // bloom has two independent motion modes — petals that breathe and lean,
  // and colours that travel outward through a still pattern. Mix freely.
  params: { sway: 0.5, colorflow: 0.4 },
});
```

Ranges, defaults and labels are all discoverable at runtime — `shader.params`
is an array of `ParamDef`, and `shader.randomParams(rand)` produces a full,
sensible param set for "randomize" flows. `shaders` and `getShader(id)` expose
the whole registry (importing either pulls every shader).

## Seamless loops

Set `loopSeconds` and the animation repeats exactly, with no visible seam at
the wrap — the frame at `t` and at `t + loopSeconds` are identical pixel for
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
  covers exactly one tile per cycle — so a short loop flows fast and a long
  one flows slowly. The hand-tuned drift rate corresponds to a period around
  60–90s; below ~30s the currents move noticeably faster than the look was
  designed for. Compensate with `speed` rather than by shortening the loop.
- **`beam` freezes its width swell below ~29s.** Its natural cycle is ~57s and
  cannot be squeezed into a short loop without becoming a throb, so under that
  threshold the swell holds still instead. Everything else still animates.
- **`bloom` sheds parts of its sway on short loops.** Its `sway` is several
  slow oscillations (petal breathing ~20s, fan lean ~30s, petal flex ~42s)
  layered over a noise wander. Each oscillation holds still once the loop is
  shorter than about half its own period, so below ~10s the wander is the only
  thing left moving. `colorflow` is unaffected — it always fits at least one
  full cycle into the loop, flowing faster on a short one.
- `halo`, `dune` and `whorl` always complete at least one full cycle of their
  main motion per loop, so a short loop simply runs them faster.
- Any loop necessarily revisits the same state every N seconds; a long period
  is what buys the impression of never repeating.
