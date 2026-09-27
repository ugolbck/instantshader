// A random palette that is still a good gradient: stops walk through OKLCh,
// so lightness climbs evenly and hue turns by a chosen arc instead of jumping
// between unrelated colours. Chroma peaks mid-ramp, where colour reads best,
// and is pulled in until every stop fits sRGB.

function oklchToSrgb(l: number, c: number, hDeg: number): [number, number, number] | null {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  if (lin.some((v) => v < -0.001 || v > 1.001)) return null;
  const enc = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [enc(lin[0]), enc(lin[1]), enc(lin[2])];
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The most saturated in-gamut colour at this lightness and hue, up to c. */
function fit(l: number, c: number, h: number): string {
  for (let cc = c; cc >= 0; cc -= 0.005) {
    const rgb = oklchToSrgb(l, cc, h);
    if (rgb) return toHex(rgb);
  }
  return toHex(oklchToSrgb(l, 0, h)!);
}

export function randomPalette(rand: () => number = Math.random): string[] {
  const n = 3 + Math.floor(rand() * 4);
  const hue0 = rand() * 360;
  // Narrow arcs give tonal ramps, wide ones give sunsets and rainbows.
  const arc = (rand() < 0.5 ? 1 : -1) * (30 + rand() * 170);
  const lo = 0.16 + rand() * 0.2;
  const hi = 0.78 + rand() * 0.18;
  const peak = 0.1 + rand() * 0.12;
  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const l = lo + (hi - lo) * t;
    const c = peak * (0.45 + 0.55 * Math.sin(Math.PI * t));
    stops.push(fit(l, c, hue0 + arc * t));
  }
  return rand() < 0.25 ? stops.reverse() : stops;
}
