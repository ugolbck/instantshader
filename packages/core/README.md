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
