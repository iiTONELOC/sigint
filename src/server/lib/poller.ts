// Shared interval-poller lifecycle: re-entry guard + immediate first run +
// setInterval + clearInterval + null-out. The gdelt/firms/news/cyclones/aircraft
// cache modules each hand-rolled this identically. (AIS is a WebSocket stream,
// not an interval poller, so it is intentionally not covered here.)

export type Poller = { start: () => void; stop: () => void };

/** `fetchFn` may return void or a Promise — its result is discarded either way. */
export function createPoller(fetchFn: () => unknown, intervalMs: number): Poller {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      if (intervalId) return;
      void fetchFn();
      intervalId = setInterval(() => void fetchFn(), intervalMs);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
