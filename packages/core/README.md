# instantshader

Animated WebGL gradient shaders with zero dependencies. Mount a live, resizable
gradient into any DOM element, or render a single frame to a detached canvas
for export pipelines. Built by [InstantGradient](https://instantgradient.com/shaders).

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
- Any loop necessarily revisits the same state every N seconds; a long period
  is what buys the impression of never repeating.
