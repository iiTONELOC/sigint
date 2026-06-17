// Shared fetch-with-timeout. Every cache poller had its own byte-identical
// AbortController + setTimeout(abort) + clearTimeout wrapper; this is the one
// copy. Callers pass their own timeout (feeds vary: 8s cone/dossier, 12s FA,
// 15s news, 30s the big NHC/FIRMS/aircraft/AIS payloads) and optional headers.
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
