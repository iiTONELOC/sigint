/** Schedule deferrable work and return a cancellation function. */
export function scheduleIdle(
  callback: () => void,
  timeout = 2_000,
): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(callback, { timeout });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, 0);
  return () => clearTimeout(handle);
}
