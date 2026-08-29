type Scheduler = { yield?: () => Promise<void> };

export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
