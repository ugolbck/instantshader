import { describe, expect, it } from "vitest";
import { beam, flow, getShader, shaders } from "../src/index";

describe("shader registry", () => {
  it("has unique ids", () => {
    const ids = shaders.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getShader looks up registered shaders by id", () => {
    expect(getShader("flow")).toBe(flow);
    expect(getShader("beam")).toBe(beam);
  });

  it("getShader returns undefined for an unknown id", () => {
    expect(getShader("nope")).toBeUndefined();
  });

  it("every param has a sane range/default and a matching fragment uniform", () => {
    for (const shader of shaders) {
      for (const param of shader.params) {
        expect(param.min, `${shader.id}.${param.key}.min < max`).toBeLessThan(param.max);
        expect(param.default, `${shader.id}.${param.key}.default >= min`).toBeGreaterThanOrEqual(
          param.min,
        );
        expect(param.default, `${shader.id}.${param.key}.default <= max`).toBeLessThanOrEqual(
          param.max,
        );
        expect(param.step, `${shader.id}.${param.key}.step > 0`).toBeGreaterThan(0);

        const uniformPattern = new RegExp(`uniform float u_${param.key}\\b`);
        expect(
          shader.fragment,
          `${shader.id} fragment missing uniform float u_${param.key}`,
        ).toMatch(uniformPattern);
      }
    }
  });

  it("randomParams(() => 0.5) returns every declared key within [min, max]", () => {
    for (const shader of shaders) {
      const result = shader.randomParams(() => 0.5);
      for (const param of shader.params) {
        expect(result, `${shader.id} randomParams missing ${param.key}`).toHaveProperty(
          param.key,
        );
        const value = result[param.key];
        expect(value, `${shader.id}.${param.key} >= min`).toBeGreaterThanOrEqual(param.min);
        expect(value, `${shader.id}.${param.key} <= max`).toBeLessThanOrEqual(param.max);
      }
    }
  });
});
