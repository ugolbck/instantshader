import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Beam, Bloom, Burst, Dune, Flow, Glint, Halo, Nacre, Silk, Strata, Whorl } from "../src/index";

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
  { name: "Silk", Component: Silk },
  { name: "Nacre", Component: Nacre },
  { name: "Burst", Component: Burst },
  { name: "Glint", Component: Glint },
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

describe("effects", () => {
  it("draws effect layers over a generator, and swaps them without remounting", async () => {
    const { Bloom, dither, pixelate } = await import("../src/index");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Bloom colors={COLORS} paused style={{ width: 200, height: 100 }} effects={[{ effect: pixelate, params: { size: 40 } }]} />,
      );
    });
    await nextFrame();
    const canvas = container.querySelector("canvas")!;
    const before = canvas.toDataURL();

    await act(async () => {
      root.render(
        <Bloom colors={COLORS} paused style={{ width: 200, height: 100 }} effects={[{ effect: dither, params: { colorMode: "duotone" } }]} />,
      );
    });
    await nextFrame();
    // Same canvas element: the stack was updated in place.
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(canvas.toDataURL()).not.toBe(before);

    await act(async () => root.unmount());
    container.remove();
  });

  it("mounts a media source", async () => {
    const { ShaderStack, halftone } = await import("../src/index");
    const picture = document.createElement("canvas");
    picture.width = 64;
    picture.height = 64;
    const ctx = picture.getContext("2d")!;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 64, 64);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ShaderStack source={{ kind: "media", media: picture }} colors={COLORS} effects={[{ effect: halftone }]} style={{ width: 120, height: 120 }} />,
      );
    });
    await nextFrame();
    expect(container.querySelector("canvas")).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });
});
