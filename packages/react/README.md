# @instantshader/react

React bindings for [instantshader](https://www.npmjs.com/package/instantshader), a
zero-dependency animated WebGL gradient engine. Drop a `<Flow>` or `<Beam>`
component into any sized wrapper to mount a live, animated gradient. Built by
[InstantGradient](https://instantgradient.com/shaders).

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
