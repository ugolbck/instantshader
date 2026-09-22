// Glyph atlas and tone lookup for the ASCII effect. Canvas 2D does the font
// work; everything that decides WHICH glyph a tone gets is measured once, at
// one fixed size, so a 900px preview and a 4K export can never disagree on a
// character (small-size hinting can reorder two glyphs of similar weight).

import type { TextureData } from "../types";

/** Cell width / height. Close to a monospace font's advance at line-height 1.2. */
export const CELL_ASPECT = 0.6;

/** Glyphs are measured, and by default rasterized, at this cell height. */
const MEASURE_HEIGHT = 64;
const MAX_GLYPH_HEIGHT = 256;

// Ramps are only a starting order: every font weighs glyphs differently, so
// they are re-sorted by measured ink coverage. "dense" is Paul Bourke's
// 70-level ramp.
export const CHARSETS: Record<string, string> = {
  standard: " .:-=+*#%@",
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  minimal: " .:oO@",
  binary: " 01",
  katakana: " ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ",
  // Not font glyphs: drawn as filled rectangles, because font block elements
  // often stop short of the cell edge and leave seams. One entry per level,
  // the digit is the level.
  blocks: "012345",
};

const BLOCK_LEVELS = [0, 0.12, 0.28, 0.48, 0.72, 1];

export type CharsetInfo = {
  /** Glyphs in ascending ink coverage. */
  glyphs: string[];
  /** Coverage of each, normalized so the densest glyph is 1. */
  coverage: number[];
  procedural: boolean;
};

type Metrics = { fontPx: number; baseline: number };

function cellWidth(height: number): number {
  return Math.max(2, Math.round(height * CELL_ASPECT));
}

/** Font size and baseline that fit the font's full line box (not any single
 * glyph's bounding box) into a cell. One shared baseline for every glyph:
 * centring each glyph on its own bounds would float "." and "_" to mid-cell. */
function fitFont(ctx: CanvasRenderingContext2D, fontFamily: string, width: number, height: number): Metrics {
  ctx.font = `100px ${fontFamily}`;
  const m = ctx.measureText("M");
  const ascent = (m.fontBoundingBoxAscent || 80) / 100;
  const descent = (m.fontBoundingBoxDescent || 20) / 100;
  const advance = (m.width || 60) / 100;
  const fontPx = Math.min(height / (ascent + descent), width / advance);
  const line = (ascent + descent) * fontPx;
  return { fontPx, baseline: (height - line) / 2 + ascent * fontPx };
}

/** Draws one glyph, white on transparent, into the cell at (x, y). A glyph
 * wider than the cell (a fallback font for katakana, say) is squeezed to fit
 * rather than clipped. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  info: CharsetInfo,
  index: number,
  x: number,
  y: number,
  w: number,
  h: number,
  metrics: Metrics,
): void {
  ctx.fillStyle = "#ffffff";
  if (info.procedural) {
    // A centred rectangle whose AREA is the level.
    const k = Math.sqrt(BLOCK_LEVELS[index]);
    ctx.fillRect(x + (w * (1 - k)) / 2, y + (h * (1 - k)) / 2, w * k, h * k);
    return;
  }
  const ch = info.glyphs[index];
  const advance = ctx.measureText(ch).width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w / 2, y + metrics.baseline);
  if (advance > w) ctx.scale(w / advance, 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

/** A transparent canvas. Text drawn on an OPAQUE canvas can get LCD subpixel
 * antialiasing, which would bake color fringes into the atlas; on a
 * transparent one browsers fall back to grayscale, and we read alpha only. */
function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("[instantshader] 2D context unavailable for the ASCII atlas");
  return [canvas, ctx];
}

/** Sorts by coverage, drops near-duplicates, normalizes to the densest.
 * Exported for tests. */
export function orderByCoverage(glyphs: string[], raw: number[]): { glyphs: string[]; coverage: number[] } {
  const order = glyphs.map((g, i) => ({ g, c: raw[i] })).sort((a, b) => a.c - b.c);
  const max = Math.max(order[order.length - 1]?.c ?? 0, 1e-6);
  const out: { g: string; c: number }[] = [];
  for (const e of order) {
    const c = e.c / max;
    // Two glyphs this close in weight are indistinguishable as tone; keeping
    // both only makes the preview/export glyph choice more fragile.
    if (out.length > 0 && c - out[out.length - 1].c < 0.004) continue;
    out.push({ g: e.g, c });
  }
  return { glyphs: out.map((e) => e.g), coverage: out.map((e) => e.c) };
}

const infoCache = new Map<string, CharsetInfo>();

/** The charset's glyphs ordered by measured ink coverage. Cached per
 * charset + font: this is the frozen ordering the spec asks for. */
export function charsetInfo(charset: string, fontFamily: string): CharsetInfo {
  const key = `${charset}|${fontFamily}`;
  const hit = infoCache.get(key);
  if (hit) return hit;

  let info: CharsetInfo;
  if (charset === "blocks") {
    info = { glyphs: CHARSETS.blocks.split(""), coverage: BLOCK_LEVELS.slice(), procedural: true };
  } else {
    const chars = Array.from(new Set(Array.from(CHARSETS[charset] ?? CHARSETS.standard)));
    const h = MEASURE_HEIGHT;
    const w = cellWidth(h);
    const [, ctx] = makeCanvas(w, h);
    const metrics = fitFont(ctx, fontFamily, w, h);
    ctx.font = `${metrics.fontPx}px ${fontFamily}`;
    const probe: CharsetInfo = { glyphs: chars, coverage: [], procedural: false };

    const alphaOf = (index: number): Uint8ClampedArray => {
      ctx.clearRect(0, 0, w, h);
      drawGlyph(ctx, probe, index, 0, 0, w, h, metrics);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const a = new Uint8ClampedArray(w * h);
      for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3];
      return a;
    };

    // What this font draws for a character it does not have ("tofu").
    probe.glyphs = [...chars, "￿"];
    const tofu = alphaOf(chars.length);
    probe.glyphs = chars;

    const kept: string[] = [];
    const raw: number[] = [];
    chars.forEach((ch, i) => {
      const a = alphaOf(i);
      let sum = 0;
      let same = true;
      for (let p = 0; p < a.length; p++) {
        sum += a[p];
        if (a[p] !== tofu[p]) same = false;
      }
      if (same && ch !== " " && sum > 0) return; // missing glyph
      kept.push(ch);
      raw.push(sum / (255 * a.length));
    });

    if (kept.length < 2) {
      info = charset === "standard"
        ? { glyphs: [" ", "#"], coverage: [0, 1], procedural: false }
        : charsetInfo("standard", fontFamily);
    } else {
      info = { ...orderByCoverage(kept, raw), procedural: false };
    }
  }
  infoCache.set(key, info);
  return info;
}

/**
 * The tone -> glyph lookup: 256x1 RGBA, one texel per 8-bit tone.
 * R = index of the densest glyph not denser than the tone, G = the next
 * glyph up, B = how far the tone sits between the two. Placing glyphs by
 * their measured coverage, not by their position in the list, is what keeps
 * tone even when a ramp's steps are not. Exported for tests.
 */
export function toneLookup(coverage: number[]): Uint8Array {
  const out = new Uint8Array(256 * 4);
  const last = coverage.length - 1;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    while (lo < last && coverage[lo + 1] <= v) lo++;
    const hi = Math.min(lo + 1, last);
    const span = coverage[hi] - coverage[lo];
    const f = span > 0 ? Math.min(1, Math.max(0, (v - coverage[lo]) / span)) : 0;
    out[i * 4] = lo;
    out[i * 4 + 1] = hi;
    out[i * 4 + 2] = Math.round(f * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Height glyphs are rasterized at for a given output cell height. Cells
 * under 64px all share the 64px atlas and the shader minifies it with a box
 * of taps, so a small preview shows the SAME letterforms as the export,
 * filtered, instead of separately hinted 11px ones. */
export function atlasGlyphHeight(cellPxHeight: number): number {
  if (cellPxHeight <= MEASURE_HEIGHT) return MEASURE_HEIGHT;
  return Math.min(MAX_GLYPH_HEIGHT, Math.round(cellPxHeight));
}

export function buildAtlas(charset: string, fontFamily: string, glyphHeight: number): TextureData {
  const info = charsetInfo(charset, fontFamily);
  const count = info.glyphs.length;
  const gh = glyphHeight;
  const gw = cellWidth(gh);
  // One transparent pixel around every glyph so LINEAR taps at a glyph's edge
  // never pick up its neighbour.
  const cw = gw + 2;
  const chh = gh + 2;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const [canvas, ctx] = makeCanvas(cols * cw, rows * chh);
  const metrics = fitFont(ctx, fontFamily, gw, gh);
  ctx.font = `${metrics.fontPx}px ${fontFamily}`;
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * cw + 1;
    const y = Math.floor(i / cols) * chh + 1;
    drawGlyph(ctx, info, i, x, y, gw, gh, metrics);
  }
  return {
    source: canvas,
    filter: "linear",
    wrap: "clamp",
    uniforms: {
      u_atlasGrid: [cols, rows],
      u_atlasSize: [canvas.width, canvas.height],
      u_glyphPx: [gw, gh],
      u_glyphCount: count,
    },
  };
}
