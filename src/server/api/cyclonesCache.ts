// ── NHC tropical-cyclone server-side cache ──────────────────────────
// Fetches https://www.nhc.noaa.gov/CurrentStorms.json every 30 minutes,
// holds the latest payload in memory, and serves it to authenticated
// clients via /api/cyclones/latest. Server-side because NHC's CDN
// returns no Access-Control-Allow-Origin header — a browser fetch from
// our origin is blocked. Verified against live NHC during step 1.
//
// SSRF (OWASP A10): NHC_URL is a hardcoded module constant. No client
// input flows into any outbound fetch — the only outbound request is
// the GET to NHC_URL inside fetchCyclones(). The /api/cyclones/latest
// route never proxies arbitrary URLs.
//
// Empty-result handling differs from firmsCache.ts: out of season,
// NHC legitimately returns { activeStorms: [] }. That IS the truth, so
// we accept it (parallels BaseProviderConfig.allowEmptyResult on the
// client side). FIRMS retains stale data on empty because empty there
// means quota exhaustion; here it means hurricane season is over.

export const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
export const USER_AGENT =
  "(sigint-dashboard, https://github.com/iitoneloc/sigint)";
export const POLL_INTERVAL_MS = 30 * 60_000; // 30 min — matches client poll
const FETCH_TIMEOUT_MS = 30_000;

// ── Types ────────────────────────────────────────────────────────────

type CyclonesBody = {
  /** Pass-through of NHC's activeStorms array. The client's parseNhc.ts
   *  is the source of truth for field-level validation. */
  activeStorms: unknown[];
};

type CyclonesCache = {
  body: CyclonesBody | null;
  fetchedAt: number;
  stormCount: number;
  error: string | null;
};

let cache: CyclonesCache = {
  body: null,
  fetchedAt: 0,
  stormCount: 0,
  error: null,
};

let intervalId: ReturnType<typeof setInterval> | null = null;

// ── Pure helpers (testable) ─────────────────────────────────────────

/** Validate the basic shape of an NHC CurrentStorms.json response.
 *  Returns the normalized body or null if the shape is wrong. */
export function normalizeCyclonesPayload(
  json: unknown,
): CyclonesBody | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const candidate = json as { activeStorms?: unknown };
  if (!Array.isArray(candidate.activeStorms)) return null;
  return { activeStorms: candidate.activeStorms };
}

// ── Fetch pipeline ───────────────────────────────────────────────────

async function fetchCyclones(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(NHC_URL, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      cache = { ...cache, error: `NHC returned ${res.status}` };
      console.warn(`🌀 NHC: HTTP ${res.status}`);
      return;
    }

    const json: unknown = await res.json();
    const normalized = normalizeCyclonesPayload(json);

    if (!normalized) {
      cache = { ...cache, error: "NHC response missing activeStorms array" };
      console.warn("🌀 NHC: malformed response (no activeStorms array)");
      return;
    }

    // Out-of-season returns activeStorms: []. That IS the truth — accept it.
    cache = {
      body: normalized,
      fetchedAt: Date.now(),
      stormCount: normalized.activeStorms.length,
      error: null,
    };

    if (normalized.activeStorms.length > 0) {
      console.log(
        `🌀 NHC: ${normalized.activeStorms.length} active cyclone(s) loaded`,
      );
    } else {
      console.log("🌀 NHC: no active cyclones (out of season or quiet day)");
    }
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
    console.warn("🌀 NHC: fetch error");
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function startCyclonesPolling(): void {
  if (intervalId) return;
  console.log("🌀 NHC: starting cyclone poll...");
  void fetchCyclones();
  intervalId = setInterval(() => void fetchCyclones(), POLL_INTERVAL_MS);
}

export function stopCyclonesPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getCyclonesCache(): CyclonesCache {
  return {
    body: cache.body,
    fetchedAt: cache.fetchedAt,
    stormCount: cache.stormCount,
    error: cache.error,
  };
}
