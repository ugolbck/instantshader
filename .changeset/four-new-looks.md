---
"instantshader": minor
"@instantshader/react": minor
---

Four new shaders, each with a matching React component:

- `halo` / `<Halo>`: an eclipse disc with a bright limb and flowing corona.
  Position it with `x` / `y`; the default is a glowing horizon arc for hero
  sections.
- `strata` / `<Strata>`: stacked cut-paper layers with soft shadows. `ridges`
  and `stretch` reshape the relief itself.
- `dune` / `<Dune>`: overlapping crests, crisp on top and airbrushed below.
- `whorl` / `<Whorl>`: a logarithmic spiral of curved blades, positionable
  with `x` / `y`.

In these four, the seed now picks an unrelated composition instead of panning
the same one. `flow` and `beam` are unchanged.
