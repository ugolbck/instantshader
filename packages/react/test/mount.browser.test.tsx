import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Beam, Bloom, Dune, Flow, Halo, Strata, Whorl } from "../src/index";

// Every shader component the package exports, exercised through the exact
// usage the README documents. A new shader is only really shipped once its
// component mounts, so adding one here is part of adding the shader.
const COMPONENTS = [
  { name: "Flow", Component: Flow },
  { name: "Beam", Component: Beam },
  { name: "Bloom", Component: Bloom },
  { name: "Halo", Component: Halo },
  { name: "Strata", Component: Strata },
  { name: "Dune", Component: Dune },
  { name: "Whorl", Component: Whorl },
] as const;

// Silences React's "not configured to support act(...)" warning; this is a
// real browser test environment, just not one React recognizes by default.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COLORS = ["#e84393", "#0984e3", "#fdcb6e"];

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

describe.each(COMPONENTS)("$name", ({ Component }) => {
  it("mounts a sized canvas and removes it on unmount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const root = createRoot(container);
    // act() flushes React's passive effects (where mountGradient is called)
    // synchronously with the render, so the canvas is guaranteed to exist
    // once this resolves instead of racing React's effect scheduling.
    await act(async () => {
      root.render(<Component colors={COLORS} style={{ width: 200, height: 100 }} />);
    });

    await nextFrame();
    await nextFrame();

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBeGreaterThan(0);
    expect(canvas!.height).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });

    expect(container.querySelector("canvas")).toBeNull();

    container.remove();
  });
});
