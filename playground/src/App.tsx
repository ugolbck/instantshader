import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shaders as ALL_SHADERS, getShader, mountGradient, type ShaderDef } from "instantshader";
import { LAB_PALETTES } from "./palettes";

/**
 * Lab grid for evaluating the InstantShader mesh shaders (beam, flow) against
 * 12 fixed palette banks. Port of the app repo's `/lab/meshkit` page. Any
 * `[instantshader]` console line here is a shader compile failure.
 *
 * DOM contract the screenshot sweep depends on:
 * - each tile is `<figure data-shader="<id>" data-palette="<name>">`
 *   containing the kit canvas + a `<figcaption>`.
 * - `document.body.dataset.gkReady = "1"` once every visible tile has
 *   rendered its first frame.
 *
 * Query params (read once at module init via location.search -- this app
 * has no client-side router, so shader/page links below are full <a href>
 * navigations that reload the page):
 * - `?shader=<id>` filters to one shader (default: all).
 * - `?page=<n>` paginates palettes (0-indexed): 6 per page when `?shader=`
 *   filters to one shader, 5 per page for the unfiltered all-shaders view.
 *   The unfiltered view is capped lower because it mounts one live WebGL
 *   context per (shader x palette) tile -- e.g. 2 shaders x 6 palettes = 12
 *   contexts is fine, but the cap protects against future shader growth
 *   pushing past Chromium's ~16-context limit and silently blanking evicted
 *   tiles. The sweep script always loads filtered URLs, so it keeps using
 *   6/page unaffected.
 * - `?frozen=1` seeks every tile to 4s and pauses it (deterministic shots).
 * - `?t=<ms>` overrides the frozen seek time (only meaningful with frozen=1),
 *   so motion can be judged by capturing the same seed at several instants.
 * - `?seedOffset=<n>` added to every tile's base seed.
 * - `?params=key:val,key:val` param override applied to every tile (keys
 *   that don't exist on a given shader are simply ignored by the kit).
 * - `?colors=f4d7fb-f9bddf-...` replaces the palette banks with one custom
 *   palette (2-8 hex stops, no #). Used for one-off renders like picker
 *   thumbnails that must match a specific app palette.
 *
 * Spacebar rerolls every visible tile's seed.
 */

// Filtered views (single shader) can afford 6 palettes/page = 6 WebGL
// contexts. The unfiltered view mounts all shaders per palette, so it must
// use a smaller page size to stay under the ~16-context cap headless
// Chromium (and some real browsers) enforce -- see the module doc comment.
const PALETTES_PER_PAGE_FILTERED = 6;
const PALETTES_PER_PAGE_UNFILTERED = 5;

function parseParamsOverride(raw: string | null): Record<string, number> | undefined {
  if (!raw) return undefined;
  const out: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [key, rawVal] = pair.split(":");
    if (!key || rawVal === undefined) continue;
    const num = Number(rawVal);
    if (Number.isFinite(num)) out[key.trim()] = num;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseColorsOverride(raw: string | null): { name: string; colors: string[] } | null {
  if (!raw) return null;
  const stops = raw
    .split("-")
    .filter((c) => /^[0-9a-fA-F]{6}$/.test(c))
    .map((c) => `#${c.toLowerCase()}`);
  if (stops.length < 2) return null;
  return { name: "custom", colors: stops.slice(0, 8) };
}

function baseSeedFor(index: number): number {
  // Deterministic spread across [0, 100) so default (non-rerolled) loads
  // are reproducible for screenshot sweeps.
  return (index * 37) % 100;
}

type Tile = {
  key: string;
  shaderDef: ShaderDef;
  palette: { name: string; colors: string[] };
};

// Read once at module init -- this is a plain Vite SPA with no router, and
// shader/page navigation below uses full <a href> reloads, so there's no
// need to resubscribe to location changes within a session.
const initialSearchParams = new URLSearchParams(window.location.search);

export default function App() {
  const searchParams = initialSearchParams;

  const shaderFilter = searchParams.get("shader");
  const rawPage = Number(searchParams.get("page") ?? "0");
  const page = Number.isFinite(rawPage) && rawPage >= 0 ? Math.floor(rawPage) : 0;
  const frozen = searchParams.get("frozen") === "1";
  const rawFreezeMs = Number(searchParams.get("t") ?? "4000");
  const freezeMs = Number.isFinite(rawFreezeMs) && rawFreezeMs >= 0 ? rawFreezeMs : 4000;
  const rawSeedOffset = Number(searchParams.get("seedOffset") ?? "0");
  const seedOffset = Number.isFinite(rawSeedOffset) ? rawSeedOffset : 0;
  const paramsOverride = useMemo(
    () => parseParamsOverride(searchParams.get("params")),
    [searchParams]
  );
  const colorsOverride = useMemo(
    () => parseColorsOverride(searchParams.get("colors")),
    [searchParams]
  );

  const shaderDefs = useMemo(() => {
    if (!shaderFilter) return ALL_SHADERS;
    const found = getShader(shaderFilter);
    return found ? [found] : [];
  }, [shaderFilter]);

  const palettesPerPage = shaderFilter ? PALETTES_PER_PAGE_FILTERED : PALETTES_PER_PAGE_UNFILTERED;
  const paletteBanks = useMemo(
    () => (colorsOverride ? [colorsOverride] : LAB_PALETTES),
    [colorsOverride]
  );
  const totalPages = Math.max(1, Math.ceil(paletteBanks.length / palettesPerPage));
  const pagedPalettes = useMemo(() => {
    const start = page * palettesPerPage;
    return paletteBanks.slice(start, start + palettesPerPage);
  }, [page, palettesPerPage, paletteBanks]);

  const tiles: Tile[] = useMemo(() => {
    const out: Tile[] = [];
    for (const shaderDef of shaderDefs) {
      for (const palette of pagedPalettes) {
        out.push({
          key: `${shaderDef.id}::${palette.name}`,
          shaderDef,
          palette,
        });
      }
    }
    return out;
  }, [shaderDefs, pagedPalettes]);

  const [seedOverrides, setSeedOverrides] = useState<Record<string, number>>({});

  const reroll = useCallback(() => {
    setSeedOverrides((prev) => {
      const next = { ...prev };
      for (const tile of tiles) {
        next[tile.key] = Math.random() * 100;
      }
      return next;
    });
  }, [tiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      e.preventDefault();
      reroll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reroll]);

  // Readiness: gkReady flips once every currently-visible tile has painted
  // its first frame. Guarded so an empty tile set (e.g. a bad ?shader=)
  // still flips ready instead of leaving a sweep script waiting forever.
  // Note: this only needs to fire once per hard page load -- shader/page
  // navigation below is a real <a> navigation (full reload), so the tile
  // set never changes size within a single React session. It must NOT be
  // reset from an effect keyed on the tile set, because passive effects
  // fire children-before-parent: by the time this component's effect ran,
  // every tile's own mount effect (which calls markReady) would already
  // have fired, and resetting here would wipe out a flag they just set.
  const readyCountRef = useRef(0);
  useEffect(() => {
    if (tiles.length === 0) {
      document.body.dataset.gkReady = "1";
    }
  }, [tiles.length]);

  const markReady = useCallback(() => {
    readyCountRef.current += 1;
    if (readyCountRef.current >= tiles.length) {
      document.body.dataset.gkReady = "1";
    }
  }, [tiles.length]);

  return (
    <main>
      <div className="header">
        <div>
          <h1>Meshkit Lab</h1>
          <p className="sub">
            {tiles.length} tiles &middot; press <kbd>space</kbd> to reroll seeds.{" "}
            {frozen ? `Frozen at t=${freezeMs}ms.` : "Live."}
          </p>
        </div>

        <div className="nav">
          <ShaderLink label="all" active={!shaderFilter} shaderId={null} currentSearch={searchParams.toString()} />
          {ALL_SHADERS.map((s) => (
            <ShaderLink
              key={s.id}
              label={s.id}
              active={shaderFilter === s.id}
              shaderId={s.id}
              currentSearch={searchParams.toString()}
            />
          ))}
          <span className="sep">|</span>
          {Array.from({ length: totalPages }, (_, i) => i).map((p) => (
            <PageLink
              key={p}
              page={p}
              active={p === page}
              shaderId={shaderFilter}
              currentSearch={searchParams.toString()}
            />
          ))}
        </div>
      </div>

      <div className="grid">
        {tiles.map((tile, idx) => {
          const seed = (seedOverrides[tile.key] ?? baseSeedFor(idx)) + seedOffset;
          return (
            <MeshTile
              key={tile.key}
              shaderDef={tile.shaderDef}
              palette={tile.palette}
              seed={seed}
              frozen={frozen}
              freezeMs={freezeMs}
              paramsOverride={paramsOverride}
              onReady={markReady}
            />
          );
        })}
      </div>
    </main>
  );
}

function ShaderLink({
  label,
  active,
  shaderId,
  currentSearch,
}: {
  label: string;
  active: boolean;
  shaderId: string | null;
  currentSearch: string;
}) {
  const params = new URLSearchParams(currentSearch);
  if (shaderId) params.set("shader", shaderId);
  else params.delete("shader");
  const href = `/?${params.toString()}`;
  return (
    <a href={href} className={active ? "active" : undefined}>
      {label}
    </a>
  );
}

function PageLink({
  page,
  active,
  shaderId,
  currentSearch,
}: {
  page: number;
  active: boolean;
  shaderId: string | null;
  currentSearch: string;
}) {
  const params = new URLSearchParams(currentSearch);
  params.set("page", String(page));
  if (shaderId) params.set("shader", shaderId);
  else params.delete("shader");
  const href = `/?${params.toString()}`;
  return (
    <a href={href} className={active ? "active" : undefined}>
      p{page}
    </a>
  );
}

function MeshTile({
  shaderDef,
  palette,
  seed,
  frozen,
  freezeMs,
  paramsOverride,
  onReady,
}: {
  shaderDef: ShaderDef;
  palette: { name: string; colors: string[] };
  seed: number;
  frozen: boolean;
  freezeMs: number;
  paramsOverride?: Record<string, number>;
  onReady: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyFiredRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    readyFiredRef.current = false;

    const handle = mountGradient(container, {
      shader: shaderDef,
      colors: palette.colors,
      seed,
      params: paramsOverride,
    });

    let rafId = 0;
    const fireReady = () => {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;
      onReady();
    };

    if (frozen) {
      // seek then pause: pause() repaints synchronously, so the first
      // frame is already on screen by the time this returns.
      handle.seek(freezeMs);
      handle.pause();
      fireReady();
    } else {
      rafId = requestAnimationFrame(fireReady);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      handle.dispose();
    };
  }, [shaderDef, palette, seed, frozen, freezeMs, paramsOverride, onReady]);

  return (
    <figure data-shader={shaderDef.id} data-palette={palette.name}>
      <div ref={containerRef} className="canvas-wrap" />
      <figcaption>
        <span>
          {shaderDef.label} &middot; {palette.name}
        </span>
        <span>seed {seed.toFixed(1)}</span>
      </figcaption>
    </figure>
  );
}
