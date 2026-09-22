import { describe, expect, it } from "vitest";
import { gridFor, outputScale, refSize } from "../src/grid";

describe("reference frame", () => {
  it("measures a 16:9 frame as 1920x1080 at every output size", () => {
    for (const [w, h] of [[640, 360], [1280, 720], [1920, 1080], [3840, 2160]]) {
      expect(refSize(w, h)).toEqual([1920, 1080]);
    }
  });

  it("cover-fits other aspect ratios", () => {
    expect(refSize(1080, 1080)).toEqual([1080, 1080]);
    expect(refSize(1080, 1920)).toEqual([607.5, 1080]);
    expect(refSize(2560, 1080)).toEqual([1920, 810]);
  });

  it("reports device pixels per reference pixel", () => {
    expect(outputScale(1920, 1080)).toBe(1);
    expect(outputScale(3840, 2160)).toBe(2);
    expect(outputScale(960, 540)).toBe(0.5);
    expect(outputScale(2160, 2160)).toBe(2);
  });
});

describe("gridFor", () => {
  it("is identical across output sizes of the same aspect ratio", () => {
    const sizes: [number, number][] = [[640, 360], [1137, 640], [1920, 1080], [3840, 2160]];
    for (const cell of [[1, 1], [4, 4], [7, 7], [14, 24]] as [number, number][]) {
      const grids = sizes.map(([w, h]) => gridFor(w, h, cell));
      for (const g of grids) {
        expect([g.cols, g.rows]).toEqual([grids[0].cols, grids[0].rows]);
      }
    }
  });

  it("does not gain a phantom column when the frame is an exact multiple", () => {
    const g = gridFor(3840, 2160, [4, 4]);
    expect([g.cols, g.rows]).toEqual([480, 270]);
    expect(g.extent).toEqual([1, 1]);
  });

  it("keeps cols and rows even so a cell boundary sits on the frame centre", () => {
    const g = gridFor(1920, 1080, [7, 7]);
    expect(g.cols % 2).toBe(0);
    expect(g.rows % 2).toBe(0);
    // 1920 / 7 = 274.3 -> 2 * ceil(137.14) = 276 columns, overhanging the frame.
    expect(g.cols).toBe(276);
    expect(g.extent[0]).toBeCloseTo((276 * 7) / 1920, 10);
  });

  it("gives whole, even output pixels per cell at 4K", () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const g = gridFor(3840, 2160, [n, n]);
      expect(g.pxPerCell).toEqual([2 * n, 2 * n]);
    }
  });

  it("rounds and floors the cell size to at least one reference pixel", () => {
    expect(gridFor(1920, 1080, [0.2, 3.6]).cell).toEqual([1, 4]);
  });
});
