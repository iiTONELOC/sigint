// Cooperative yield to the main thread between chunks of a long task, so
// input and paint are serviced mid-computation. Prefers the platform
// scheduler; falls back to a macrotask. Unlike requestIdleCallback this
// resumes on the next task rather than waiting for idle — used to slice the
// derived data pass so a data poll never blocks the DOM.
type Scheduler = { yield?: () => Promise<void> };

export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
