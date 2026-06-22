// Shared pure math for the render worker modules (bundled). Single source so
// pointWorker and the per-feature render modules agree on sizing.

/** Zoom → point-size scale: zoom 1 → 0.5×, 3 → 1.0×, 5 → 1.5×, 6.2+ → 1.8× (capped). */
export function zoomScale(zoom: number): number {
  return Math.min(1.8, 0.5 + Math.max(0, (zoom - 1) / 4));
}
