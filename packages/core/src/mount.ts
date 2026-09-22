import type { MountHandle, MountOptions, StackHandle, StackMountOptions } from "./types";
import { createStackRenderer } from "./stack";
import { resolveParams } from "./params";

/**
 * Mounts a live, animated stack (a source plus effect layers) into `container` and returns a handle to
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
export function mountStack(container: HTMLElement, opts: StackMountOptions): StackHandle {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  let source = opts.source;
  let speed = opts.speed ?? 1;

  const renderer = createStackRenderer({
    canvas,
    source,
    effects: opts.effects,
    colors: opts.colors,
    seed: opts.seed ?? 0,
    loopSeconds: opts.loopSeconds,
    background: opts.background,
    fontFamily: opts.fontFamily,
  });

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

  /** Sets the backing store to an exact device-pixel size (DPR capped at 2). */
  function applyDeviceSize(deviceWidth: number, deviceHeight: number): void {
    // Recomputed per-resize (not cached at mount) so dragging the window to
    // a monitor with a different pixel density is picked up automatically.
    const dpr = window.devicePixelRatio || 1;
    const cap = dpr > 2 ? 2 / dpr : 1;
    const width = Math.max(1, Math.round(deviceWidth * cap));
    const height = Math.max(1, Math.round(deviceHeight * cap));
    if (canvas.width !== width || canvas.height !== height) {
      renderer.resize(width, height);
      if (!playing) renderOnce();
    }
  }

  function applyCssSize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1;
    applyDeviceSize(cssWidth * dpr, cssHeight * dpr);
  }

  const initialRect = container.getBoundingClientRect();
  applyCssSize(initialRect.width || 1, initialRect.height || 1);

  // Size from the element's DEVICE-pixel box where the browser reports one.
  // cssSize * devicePixelRatio is off by up to a pixel at fractional DPR or
  // browser zoom (a 791.98px-wide box, say); the browser then resamples the
  // whole canvas to fit, in gamma space, which blurs a gradient harmlessly
  // but turns a fine dither or halftone into moire that is not in the render.
  // Safari has no device-pixel-content-box and keeps the old computation.
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const device = entry.devicePixelContentBoxSize?.[0];
      if (device) applyDeviceSize(device.inlineSize, device.blockSize);
      else applyCssSize(entry.contentRect.width, entry.contentRect.height);
    }
  });
  try {
    resizeObserver.observe(container, { box: "device-pixel-content-box" });
  } catch {
    resizeObserver.observe(container);
  }

  const handle: StackHandle = {
    canvas,
    setColors(next: string[]): void {
      renderer.setColors(next);
      if (!playing) renderOnce();
    },
    setSource(next): void {
      source = next;
      renderer.setSource(next);
      if (!playing) renderOnce();
    },
    setSourceParams(next: Record<string, number>): void {
      if (source.kind !== "generator") return;
      // Merged, not replaced: a caller pushing one slider's value must not
      // reset every other param to its default.
      source = { ...source, params: { ...resolveParams(source.shader, source.params), ...next } };
      renderer.setSourceParams(source.params!);
      if (!playing) renderOnce();
    },
    setEffects(next): void {
      renderer.setEffects(next);
      if (!playing) renderOnce();
    },
    setEffectParams(index, next): void {
      renderer.setEffectParams(index, next);
      if (!playing) renderOnce();
    },
    refreshMedia(): void {
      renderer.refreshMedia();
      if (!playing) renderOnce();
    },
    getGridInfo: renderer.getGridInfo,
    setLoopSeconds(seconds: number | undefined): void {
      renderer.setLoopSeconds(seconds);
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

/** mountStack() for the common case of one generator and no effects. */
export function mountGradient(container: HTMLElement, opts: MountOptions): MountHandle {
  const handle = mountStack(container, {
    source: { kind: "generator", shader: opts.shader, params: opts.params },
    colors: opts.colors,
    speed: opts.speed,
    seed: opts.seed,
    loopSeconds: opts.loopSeconds,
  });
  return {
    canvas: handle.canvas,
    setColors: handle.setColors,
    setParams: handle.setSourceParams,
    setSpeed: handle.setSpeed,
    setLoopSeconds: handle.setLoopSeconds,
    pause: handle.pause,
    resume: handle.resume,
    seek: handle.seek,
    getTimeMs: handle.getTimeMs,
    dispose: handle.dispose,
  };
}
