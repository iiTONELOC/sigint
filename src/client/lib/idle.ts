// Run a callback during browser idle time, falling back to a macrotask where
// requestIdleCallback is unavailable (older Safari, jsdom/test env). Keeps
// heavy-but-deferrable work (IndexedDB writes, trail recording, correlation
// marshalling) off the data-poll tick so it never blocks an active drag/zoom.
export function scheduleIdle(cb: () => void, timeout = 2_000): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => cb(), { timeout });
  } else {
    setTimeout(cb, 0);
  }
}
