---
"instantshader": minor
"@instantshader/react": minor
---

Restore `flow`'s swirl, and add a `curl` parameter.

0.2.0 swapped flow's curl potential from simplex to periodic Perlin so the
drift could travel in a straight line and still loop. That silently flattened
the look: classic Perlin's lattice is a unit grid while simplex's skewed cells
are roughly 0.7 units, so the same input scale produced a ~40% coarser field
with correspondingly shallower gradients — the eddies stopped closing and the
frame degenerated toward soft diagonal bands.

Retuned against a reference render of the pre-0.2.0 look: the curl field's
frequency is up (the old hardcoded 0.55 is now the `curl` param, default 1.05)
and the advection step gain is up from 0.055 to 0.19 to absorb pnoise's
shallower gradients.

- **New `curl` param** on flow (0.3–1.6, default 1.05) — how tight the eddies
  are. Low values give big lazy currents carrying whole colour masses; past
  ~1.2 the curl field is finer than the masses and the swirl degenerates into
  edge roughening.
- `drift`'s range and default are unchanged (0–1, default 0.5). The gradient
  difference is absorbed by the step gain in the GLSL rather than by moving a
  published knob under callers.
- `randomParams` now varies `curl`, and no longer returns a `drift` of 0.

Flow renders differently from 0.2.0 at identical settings — that is the point
of the release.
