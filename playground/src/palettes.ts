// Curated palette bank, grouped by mood. Hardcoded (not generated) so
// screenshot sweeps are deterministic across runs. Every palette runs in the
// order a gradient should use it; most go dark to light because the looks
// read the ramp as depth, but the duos and brights are deliberately flat.

export type Palette = { name: string; colors: string[] };
export type PaletteGroup = { name: string; palettes: Palette[] };

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    name: "Dusk",
    palettes: [
      { name: "Afterglow", colors: ["#1a1446", "#5b2a9e", "#e0457b", "#ff9e5e", "#ffe3b3"] },
      { name: "Sunset strip", colors: ["#140f30", "#3a1152", "#6b1868", "#9c2168", "#ce3b5e", "#eb6a4e", "#f6a24a", "#fcd87c"] },
      { name: "Mauve hour", colors: ["#2b1d3a", "#6b3a6e", "#b5608a", "#f0a3a0", "#ffe0c7"] },
      { name: "Ember", colors: ["#140a0a", "#4a1410", "#a3301a", "#f06a28", "#ffc15e"] },
      { name: "Violet dusk", colors: ["#0f0c29", "#302b63", "#6b4c9a", "#c38fd6", "#f5d0f0"] },
      { name: "Iris", colors: ["#4158d0", "#c850c0", "#ffcc70"] },
      { name: "Blue hour", colors: ["#141e30", "#2b5876", "#4e4376", "#d38fa6"] },
    ],
  },
  {
    name: "Neon",
    palettes: [
      { name: "Arcade", colors: ["#ff2ed1", "#00f5a0", "#ffe600", "#00d1ff", "#ff4d4d"] },
      { name: "Synthwave", colors: ["#1b0033", "#5b0b8f", "#ff2a6d", "#ff9e3d", "#05d9e8"] },
      { name: "Laser", colors: ["#03001e", "#7303c0", "#ec38bc", "#fdeff9"] },
      { name: "Acid", colors: ["#0a0f24", "#00c9a7", "#c4fc4c", "#f9f871"] },
      { name: "Hyperpop", colors: ["#ff00a0", "#7b2ff7", "#00e0ff", "#fffb00"] },
      { name: "Cyber", colors: ["#050816", "#2d1b69", "#0ff0fc", "#f72585"] },
    ],
  },
  {
    name: "Soft",
    palettes: [
      { name: "Macaron", colors: ["#ffd6e0", "#ffe8cd", "#d9f2e3", "#cfe8f7", "#e4d9f7"] },
      { name: "Cotton", colors: ["#fbe7f0", "#e5d4f7", "#c8e2fb", "#c9f2e6"] },
      { name: "Peach milk", colors: ["#fff1e6", "#fdd9c4", "#f8b4a6", "#e39aa6", "#b98bb8"] },
      { name: "Lilac mist", colors: ["#f3eefe", "#dcd0fb", "#bba7f2", "#9a86e0"] },
      { name: "Mint cream", colors: ["#f2fff8", "#c9f5e3", "#92e3c9", "#5cc6b0"] },
      { name: "Holo", colors: ["#c6ffdd", "#fbd786", "#f7797d"] },
      { name: "Bubblegum", colors: ["#6ec5ff", "#9ee7ff", "#ffc6e6", "#ff9ad5"] },
    ],
  },
  {
    name: "Earth",
    palettes: [
      { name: "Clay", colors: ["#3b2a1e", "#7a5233", "#b0885a", "#d9bd8f", "#efe3cb"] },
      { name: "Desert", colors: ["#3d2a1f", "#8a5a3b", "#d08c5b", "#eec69b", "#f9ead3"] },
      { name: "Moss", colors: ["#1d2b1f", "#3e5a36", "#7a8f4e", "#bfc27a", "#eee8b8"] },
      { name: "Terracotta", colors: ["#2e1a16", "#7a3526", "#c0623f", "#e6a36f", "#f4dfc2"] },
      { name: "Olive grove", colors: ["#232619", "#4f5a2f", "#8c9454", "#cfcd9a"] },
      { name: "Canyon", colors: ["#2a1410", "#6e2c1e", "#b85c38", "#e09f6b", "#8fb3c9"] },
    ],
  },
  {
    name: "Ocean",
    palettes: [
      { name: "Deep sea", colors: ["#081a3d", "#123a73", "#1e63ac", "#4c9edb", "#aedaf7"] },
      { name: "Lagoon", colors: ["#002b36", "#005f73", "#0a9396", "#94d2bd", "#e9d8a6"] },
      { name: "Glacier", colors: ["#0d1b2a", "#1b3a5c", "#3f7cac", "#95c8e8", "#eaf6ff"] },
      { name: "Kelp", colors: ["#04151f", "#183a37", "#3c6e5c", "#88b39c", "#e0efe2"] },
      { name: "Tide", colors: ["#05668d", "#028090", "#00a896", "#02c39a", "#f0f3bd"] },
      { name: "Aurora", colors: ["#0b1026", "#1b3b6f", "#22a39f", "#9ef01a"] },
    ],
  },
  {
    name: "Jewel",
    palettes: [
      { name: "Crown", colors: ["#0b3d91", "#0f5c3d", "#7a1030", "#5b2a86", "#b8860b", "#1c2951"] },
      { name: "Emerald", colors: ["#04201a", "#0b5d46", "#19a476", "#7de2b8", "#d9fbe9"] },
      { name: "Sapphire", colors: ["#0a0f3c", "#1e2a8a", "#3d5af1", "#8fa6ff", "#e0e6ff"] },
      { name: "Amethyst", colors: ["#1b0930", "#4b1a7a", "#8e44ad", "#c79be0", "#f1ddff"] },
      { name: "Garnet", colors: ["#1f0508", "#5c0f1c", "#9e1b32", "#e0566c", "#ffc2cb"] },
    ],
  },
  {
    name: "Bright",
    palettes: [
      { name: "Spectrum", colors: ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c2a8", "#0a84ff", "#5e5ce6", "#ff375f"] },
      { name: "Sorbet", colors: ["#ff6f91", "#ff9671", "#ffc75f", "#f9f871"] },
      { name: "Pop", colors: ["#ff3b30", "#ffd60a", "#0a84ff", "#f5f5f5"] },
      { name: "Tropic", colors: ["#1b998b", "#00cecb", "#ffed66", "#ff5e5b"] },
      { name: "Primary", colors: ["#4f46e5", "#ec4899", "#22d3ee"] },
    ],
  },
  {
    name: "Mono",
    palettes: [
      { name: "Ink", colors: ["#0a0a0a", "#3a3a3a", "#8a8a8a", "#e8e8e8"] },
      { name: "Graphite", colors: ["#0e1116", "#262c36", "#4b5566", "#8b95a7", "#d7dde6"] },
      { name: "Nightshade", colors: ["#050507", "#0d0b14", "#181228", "#241a3d", "#312353", "#3e2c6b", "#4c3684", "#5a419c"] },
      { name: "Rose", colors: ["#2a0f18", "#6b1f3a", "#b4466b", "#e89ab4", "#fbe1ea"] },
      { name: "Paper", colors: ["#fffbf2", "#fbefda", "#f3dfc0", "#e9cba0"] },
      { name: "Soot", colors: ["#0a0908", "#141210", "#201c18"] },
    ],
  },
  {
    name: "Duo",
    palettes: [
      { name: "Marigold", colors: ["#ff6b35", "#ffd166"] },
      { name: "Arctic", colors: ["#123c69", "#5fd4e8"] },
      { name: "Cherry", colors: ["#2a0610", "#e3334e"] },
      { name: "Mint chip", colors: ["#0b2e2a", "#9ff0d0"] },
      { name: "Ultraviolet", colors: ["#1a0b3b", "#b388ff"] },
      { name: "Lemon lime", colors: ["#2ecc71", "#fff35c"] },
    ],
  },
];

export const ALL_PALETTES: Palette[] = PALETTE_GROUPS.flatMap((g) => g.palettes);

export const DEFAULT_PALETTE: Palette = PALETTE_GROUPS[0].palettes[0];

/** Name of the preset these colours match exactly, if any. */
export function presetName(colors: string[]): string | undefined {
  const key = colors.join(",").toLowerCase();
  return ALL_PALETTES.find((p) => p.colors.join(",").toLowerCase() === key)?.name;
}
