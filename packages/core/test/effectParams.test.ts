import { describe, expect, it, vi } from "vitest";
import { hexToRgb, paramUniform, resolveEffectParams } from "../src/effectParams";
import { orderByCoverage, toneLookup } from "../src/effects/asciiAtlas";
import type { EffectDef } from "../src/types";

const def: EffectDef = {
  id: "t",
  label: "T",
  fragment: "void main(){}",
  params: [
    { key: "size", label: "Size", min: 1, max: 10, step: 1, default: 4 },
    { key: "mode", label: "Mode", type: "enum", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], default: "b" },
    { key: "on", label: "On", type: "bool", default: true },
    { key: "ink", label: "Ink", type: "color", default: "#ff8000" },
  ],
  randomParams: () => ({}),
};

describe("resolveEffectParams", () => {
  it("fills every key from defaults", () => {
    expect(resolveEffectParams(def)).toEqual({ size: 4, mode: "b", on: true, ink: "#ff8000" });
  });

  it("keeps valid overrides", () => {
    expect(resolveEffectParams(def, { size: 7, mode: "a", on: false, ink: "#000000" })).toEqual({
      size: 7, mode: "a", on: false, ink: "#000000",
    });
  });

  it("falls back to the default on a bad value and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = { size: "big", mode: "zzz", on: 1, ink: "red" };
    expect(resolveEffectParams(def, bad)).toEqual({ size: 4, mode: "b", on: true, ink: "#ff8000" });
    const calls = warn.mock.calls.length;
    resolveEffectParams(def, bad);
    expect(warn.mock.calls.length).toBe(calls);
    warn.mockRestore();
  });
});

describe("paramUniform", () => {
  it("uploads an enum as its option index, so stored values stay strings", () => {
    expect(paramUniform(def.params[1], "a")).toBe(0);
    expect(paramUniform(def.params[1], "b")).toBe(1);
  });
  it("uploads a bool as 0/1 and a color as sRGB 0-1", () => {
    expect(paramUniform(def.params[2], true)).toBe(1);
    expect(paramUniform(def.params[2], false)).toBe(0);
    expect(paramUniform(def.params[3], "#ff8000")).toEqual([1, 128 / 255, 0]);
  });
  it("parses hex with or without the hash and rejects the rest", () => {
    expect(hexToRgb("0000ff")).toEqual([0, 0, 1]);
    expect(hexToRgb("#00f")).toBeNull();
  });
});

describe("ASCII tone lookup", () => {
  it("orders glyphs by coverage, normalizes, and drops near-duplicates", () => {
    const r = orderByCoverage(["#", " ", ".", ":"], [0.5, 0, 0.1, 0.1005]);
    expect(r.glyphs).toEqual([" ", ".", "#"]);
    expect(r.coverage).toEqual([0, 0.2, 1]);
  });

  it("places glyphs by coverage, not by list position", () => {
    // Three glyphs at coverage 0, 0.2, 1: tone 0.6 sits halfway between the
    // last two, which a position-based ramp would have put at glyph 1.2.
    const lut = toneLookup([0, 0.2, 1]);
    const at = (tone: number) => Array.from(lut.slice(tone * 4, tone * 4 + 3));
    expect(at(0)).toEqual([0, 1, 0]);
    expect(at(51)).toEqual([1, 2, 0]); // 51/255 = 0.2 exactly
    // 0.6 -> halfway between the two (127 or 128 depending on float rounding).
    expect(at(153).slice(0, 2)).toEqual([1, 2]);
    expect(Math.abs(at(153)[2] - 127.5)).toBeLessThanOrEqual(0.5);
    expect(at(255)[0]).toBe(2);
  });
});
