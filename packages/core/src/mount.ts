import type { MountHandle, MountOptions } from "./types";
import { createRenderer } from "./renderer";
import { resolveParams } from "./params";

/**
 * Mounts a live, animated gradient into `container` and returns a handle to
 * control it. Owns a canvas (sized to the container via ResizeObserver, DPR
 * capped at 2 to bound fill-rate cost on high-density displays) and a RAF
 * loop that runs ONLY while playing — the same lifecycle used by the
 * InstantGradient app's canvas preview, which stops scheduling
 * requestAnimationFrame entirely while paused/frozen rather than continuing
 * to tick with no-op frames. pause() cancels the
 * in-flight frame and freezes `clockMs`; resume() restarts the loop from
 * there. Since the loop is fully stopped while paused, setColors/setParams/
 * seek/resize (via the ResizeObserver) each trigger a single on-demand
 * `renderer.renderAt(clockMs)` so a paused canvas still repaints immediately
 * instead of going stale until the next resume() — this matters because
 * callers may mount many simultaneously-paused instances (e.g. a screenshot
 * grid) that must never carry a perpetual 60fps draw loop each.
 */
export function mountGradient(container: HTMLElement, opts: MountOptions): MountHandle {
  const def = opts.shader;

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  let colors = opts.colors;
  let params = resolveParams(def, opts.params);
  let speed = opts.speed ?? 1;
  const seed = opts.seed ?? 0;

  const renderer = createRenderer({ canvas, shader: def, colors, params, seed });

  // `clockMs` is the authoritative playback position handed to renderAt().
  // `epoch` is the performance.now() timestamp that would correspond to
  // clockMs=0 at the current speed; it's recomputed (never just reset)
  // whenever play state or speed changes so the visible animation never
  // jumps.
  let clockMs = 0;
  let epoch = performance.now();
  let playing = true;
  let disposed = false;
  let rafId = 0;

  /** Resyncs `epoch` so that (now - epoch) * speed === clockMs, i.e. the
   * next tick continues smoothly from the current position at the current
   * speed. Guards speed === 0 since that division is undefined and the
   * product would be zero regardless of epoch. */
  function resyncEpoch(): void {
    const now = performance.now();
    epoch = speed === 0 ? now : now - clockMs / speed;
  }

  // Invariant: a paused-or-zero-speed clock is frozen -- `clockMs` must
  // never be recomputed from `(performance.now() - epoch) * speed` while
  // either condition holds. At speed === 0 that formula always collapses
  // to 0 regardless of elapsed real time or the frozen position, so every
  // call site that derives clockMs from it (tick's per-frame update,
  // pause()'s final freeze, and setSpeed()'s pre-change freeze under the
  // OLD speed) must skip the recompute and leave clockMs exactly as it
  // was. resyncEpoch() above already guards its own division; this is the
  // same invariant applied to the multiplication side.

  /** Draws the current clock position once, without touching the RAF loop.
   * Used so paused-canvas mutations (colors/params/size) show up right
   * away instead of waiting for the next resume(). */
  function renderOnce(): void {
    renderer.renderAt(clockMs);
  }

  function tick(): void {
    if (speed !== 0) {
      clockMs = (performance.now() - epoch) * speed;
    }
    renderer.renderAt(clockMs);
    // tick() itself always re-queues; it's pause()/dispose() that call
    // cancelAnimationFrame to actually stop the loop, and resume() that
    // restarts it. This keeps "is the loop running" a single source of
    // truth (rafId) instead of an extra flag tick() has to check.
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  function applySize(cssWidth: number, cssHeight: number): void {
    // Recomputed per-resize (not cached at mount) so dragging the window to
    // a monitor with a different pixel density is picked up automatically.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      renderer.resize(width, height);
      if (!playing) renderOnce();
    }
  }

  const initialRect = container.getBoundingClientRect();
  applySize(initialRect.width || 1, initialRect.height || 1);

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      applySize(entry.contentRect.width, entry.contentRect.height);
    }
  });
  resizeObserver.observe(container);

  const handle: MountHandle = {
    canvas,
    setColors(next: string[]): void {
      colors = next;
      renderer.setColors(colors);
      if (!playing) renderOnce();
    },
    setParams(next: Record<string, number>): void {
      params = { ...params, ...next };
      renderer.setParams(params);
      if (!playing) renderOnce();
    },
    setSpeed(next: number): void {
      if (playing && speed !== 0) {
        // Freeze the current position under the OLD speed before changing
        // it, otherwise resyncEpoch would rebase using the new speed
        // against a clockMs that was never actually reached at that speed.
        // Skipped when the OLD speed is already 0: the clock is already
        // frozen (tick() never advanced it), so recomputing here would
        // collapse it back to 0 instead of preserving the frozen position.
        clockMs = (performance.now() - epoch) * speed;
      }
      speed = next;
      resyncEpoch();
    },
    pause(): void {
      if (!playing) return;
      if (speed !== 0) {
        clockMs = (performance.now() - epoch) * speed;
      }
      playing = false;
      cancelAnimationFrame(rafId);
      // If pause() runs before the browser has ever fired the loop's first
      // queued frame (e.g. mount() then pause() in the same synchronous
      // block), the cancel above kills that pending frame and nothing has
      // painted yet — render once now so the canvas never sits blank.
      renderOnce();
    },
    resume(): void {
      if (playing) return;
      playing = true;
      resyncEpoch();
      rafId = requestAnimationFrame(tick);
    },
    seek(ms: number): void {
      clockMs = ms;
      resyncEpoch();
      if (!playing) renderOnce();
    },
    getTimeMs(): number {
      return clockMs;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };

  return handle;
}
