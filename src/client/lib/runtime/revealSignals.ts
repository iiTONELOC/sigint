// Pulse a transient "reveal" or "zoom-to" id, then clear it after the globe has
// consumed it. Every pane and context hand-wrote `set(id); setTimeout(() =>
// set(null), N)` with these two magic durations — this is the one owner.

/** How long a reveal/pan id stays set before the globe-consume window closes. */
const REVEAL_CLEAR_MS = 200;
/** Zoom-to is a faster trigger than the gentle reveal pan. */
const ZOOM_CLEAR_MS = 100;

type SetId = (id: string | null) => void;

/** Set `revealId` to pulse a gentle pan, then clear it after the reveal window. */
export function revealThenClear(setRevealId: SetId, id: string): void {
  setRevealId(id);
  setTimeout(() => setRevealId(null), REVEAL_CLEAR_MS);
}

/** Set `zoomToId` to trigger a zoom, then clear it after the zoom window. */
export function zoomToThenClear(setZoomToId: SetId, id: string): void {
  setZoomToId(id);
  setTimeout(() => setZoomToId(null), ZOOM_CLEAR_MS);
}
