// "Tint": a gradient map of the layer below by brightness, duotone (two
// colours) or the palette ramp, faded in by amount. A soft effect: stacked
// after a mark effect it recolours marks and backdrop together, and it works
// over any source. The fade is done in linear light; the palette ramp is
// already perceptual.

import type { EffectDef } from "../types";

const FRAGMENT = `
uniform float u_mode;
uniform vec3 u_dark;
uniform vec3 u_light;
uniform float u_amount;
void main() {
  vec3 c = source(v_uv).rgb;
  float t = luma(c);
  vec3 mapped = u_mode < 0.5 ? mix(u_dark, u_light, t) : palette(t);
  gl_FragColor = vec4(toSrgb(mix(toLinear(c), toLinear(mapped), u_amount)), 1.0);
}
`;

export const tint: EffectDef = {
  id: "tint",
  label: "Tint",
  fragment: FRAGMENT,
  params: [
    {
      key: "mode",
      label: "Mode",
      type: "enum",
      options: [
        { value: "duotone", label: "Duotone" },
        { value: "palette", label: "Palette" },
      ],
      default: "duotone",
    },
    { key: "dark", label: "Dark", type: "color", default: "#1b1a4a", when: { key: "mode", in: ["duotone"] } },
    { key: "light", label: "Light", type: "color", default: "#f2c6a0", when: { key: "mode", in: ["duotone"] } },
    { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, default: 1 },
  ],
  randomParams(rand) {
    return { mode: rand() < 0.5 ? "duotone" : "palette", dark: "#1b1a4a", light: "#f2c6a0", amount: 0.6 + rand() * 0.4 };
  },
};
