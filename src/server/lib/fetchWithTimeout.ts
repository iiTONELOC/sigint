// Shared fetch-with-timeout. Every cache poller had its own byte-identical
// AbortController + setTimeout(abort) + clearTimeout wrapper; this is the one
// copy. Callers pass a timeout from the named tiers below and optional headers.

/** Standard upstream call (NHC products, ATCF, cone/dossier, HexDB lookups). */
export const FETCH_TIMEOUT_STANDARD_MS = 8_000;
/** Large payloads (full NHC/FIRMS/aircraft feeds). */
export const FETCH_TIMEOUT_LARGE_MS = 30_000;
/** FlightAware dossier pages on the foreground selection path. */
export const FETCH_TIMEOUT_FLIGHTAWARE_MS = 2_500;

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
