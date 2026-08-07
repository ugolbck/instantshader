/**
 * Parses a pasted palette into hex stops.
 *
 * Built for share links of the shape `somewhere.com/hex1-hex2-...-hexN`,
 * which is what both InstantGradient and Coolors emit — Coolors as either
 * `coolors.co/f4d7fb-f9bddf-...` or `coolors.co/palette/f4d7fb-f9bddf-...`.
 * Rather than pattern-matching known hosts (which breaks the moment either
 * site changes its path, or you paste from a third one), this takes the last
 * path segment of anything URL-shaped and keeps whatever in it looks like a
 * hex colour. A `/palette/` segment simply fails the hex test and is dropped.
 *
 * Also accepts raw input, so pasting `#ff0000, #00ff00` or `f00 0f0` from
 * anywhere else works without ceremony.
 */

export const MIN_COLORS = 2;
export const MAX_COLORS = 10;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Expands 3-digit shorthand and normalizes to a lowercase `#rrggbb`. */
function normalizeHex(token: string): string | null {
  const match = HEX.exec(token.trim());
  if (!match) return null;
  const body = match[1].toLowerCase();
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  return `#${full}`;
}

/**
 * Returns the parsed stops, or null if fewer than MIN_COLORS were found.
 *
 * Truncates at MAX_COLORS rather than rejecting: a 12-stop link is a
 * reasonable thing to paste, and silently keeping the first 10 is friendlier
 * than refusing the whole thing.
 */
export function parsePalette(input: string): string[] | null {
  const raw = input.trim();
  if (!raw) return null;

  // Reduce anything URL-shaped to its last path segment. Done by hand rather
  // than with `new URL()` because pasted links routinely arrive without a
  // protocol ("coolors.co/..."), which URL rejects outright.
  let body = raw;
  const withoutScheme = body.replace(/^[a-z]+:\/\//i, "");
  if (withoutScheme.includes("/") || withoutScheme.includes(".")) {
    const path = withoutScheme.split(/[?#]/)[0];
    const segments = path.split("/").filter(Boolean);
    body = segments.length > 0 ? segments[segments.length - 1] : path;
  }

  const stops = body
    .split(/[-,\s]+/)
    .map(normalizeHex)
    .filter((c): c is string => c !== null);

  if (stops.length < MIN_COLORS) return null;
  return stops.slice(0, MAX_COLORS);
}
