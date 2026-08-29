export type Poller = { start: () => void; stop: () => void };

/** Create a guarded interval poller with an immediate first run. */
export function createPoller(fetchFn: () => unknown, intervalMs: number): Poller {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      if (intervalId) return;
      fetchFn();
      intervalId = setInterval(fetchFn, intervalMs);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
