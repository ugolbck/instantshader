// Fixed palette banks for the meshkit lab grid. Hardcoded (not generated) so
// screenshot sweeps are deterministic across runs. Loosely inspired by a
// handful of palette strategies: mono ramp, analogous, wide-spread, muted
// neutrals, pastel.

export const LAB_PALETTES: { name: string; colors: string[] }[] = [
  { name: "duo-warm", colors: ["#FF6B35", "#FFD166"] },
  { name: "duo-cold", colors: ["#123C69", "#5FD4E8"] },
  {
    name: "pastel-5",
    colors: ["#FFD6E0", "#FFE8CD", "#D9F2E3", "#CFE8F7", "#E4D9F7"],
  },
  {
    name: "neon-5",
    colors: ["#FF2ED1", "#00F5A0", "#FFE600", "#00D1FF", "#FF4D4D"],
  },
  {
    name: "earth-5",
    colors: ["#3B2A1E", "#7A5233", "#B0885A", "#D9BD8F", "#EFE3CB"],
  },
  {
    name: "mono-blue-5",
    colors: ["#081A3D", "#123A73", "#1E63AC", "#4C9EDB", "#AEDAF7"],
  },
  {
    name: "dark-8",
    colors: [
      "#050507",
      "#0D0B14",
      "#181228",
      "#241A3D",
      "#312353",
      "#3E2C6B",
      "#4C3684",
      "#5A419C",
    ],
  },
  {
    name: "bright-8",
    colors: [
      "#FF3B30",
      "#FF9500",
      "#FFCC00",
      "#34C759",
      "#00C2A8",
      "#0A84FF",
      "#5E5CE6",
      "#FF375F",
    ],
  },
  {
    name: "sunset-8",
    colors: [
      "#140F30",
      "#3A1152",
      "#6B1868",
      "#9C2168",
      "#CE3B5E",
      "#EB6A4E",
      "#F6A24A",
      "#FCD87C",
    ],
  },
  { name: "near-black-3", colors: ["#0A0908", "#141210", "#201C18"] },
  {
    name: "cream-4",
    colors: ["#FFFBF2", "#FBEFDA", "#F3DFC0", "#E9CBA0"],
  },
  {
    name: "jewel-6",
    colors: [
      "#0B3D91",
      "#0F5C3D",
      "#7A1030",
      "#5B2A86",
      "#B8860B",
      "#1C2951",
    ],
  },
];
