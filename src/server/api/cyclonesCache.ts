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

import { anyActiveBasinInSeason } from "../../shared/cyclonesSeason";
import { enrichStorms } from "./cyclonesForecastTrack";
import { createLogger } from "../lib/logger";

const logger = createLogger({ service: "nhc" });

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

// HTTP conditional-fetch state — captured from each successful 200 and
// echoed back via If-Modified-Since / If-None-Match on the next poll.
// Kept separate from `cache` so the public getCyclonesCache() shape
// stays identical (consumers don't need to know about the cacheing
// mechanism). `If-None-Match` (ETag) takes precedence at the origin
// when both are sent, but we send both because NHC returns both and
// keeping them in sync is cheaper than tracking which one moved.
type ConditionalState = {
  lastModified: string | null;
  etag: string | null;
};

let conditionalState: ConditionalState = {
  lastModified: null,
  etag: null,
};

// Last successful 200's advisory-hash. Used to dedup successive
// polls during a single NHC advisory cycle (NHC re-publishes the
// same body every minute even when no storm details have changed).
// Cleared on `__resetCyclonesCacheForTests`.
let lastAdvisoryHash: string | null = null;

// Per-storm URL stash. Populated from each successful CurrentStorms.json
// response — direct URLs for the three text products and the cone KMZ
// come straight from NHC's payload (2019 schema). Consumers (dossier
// cache, cone cache) read these by stormId to issue downstream fetches
// against the URLs NHC published, never construct their own.
export type StormProducts = {
  advisoryUrl?: string;
  discussionUrl?: string;
  windProbsUrl?: string;
  conekmzUrl?: string;
  trackKmzUrl?: string;
};

const stormProducts = new Map<string, StormProducts>();

// Optional listener fired when the advisory hash changes — used by the
// dossier + cone caches to eager-prefetch per-storm products instead of
// waiting for a client request to lazy-load them. Registered once at
// server startup.
type AdvisoryChangeListener = (stormIds: string[]) => void;
let advisoryChangeListener: AdvisoryChangeListener | null = null;

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

/** Decide whether to issue a live NHC fetch on this poll tick.
 *  - Empty cache + all in-scope basins out of season → skip. NHC is a
 *    no-op call out of season anyway; skipping saves a request.
 *  - Empty cache + at least one basin in season → fetch.
 *  - Non-empty cache → always fetch (continuity — we want to see a
 *    storm dissipate, not freeze the snapshot at last in-season tick).
 *
 *  `now` is a parameter only so the spec can test the gate at synthetic
 *  dates without monkey-patching Date. Production callers omit it. */
export function shouldFetchCyclones(
  currentStormCount: number,
  now: Date = new Date(),
): boolean {
  if (currentStormCount > 0) return true;
  return anyActiveBasinInSeason(now);
}

/** Compose the per-request headers, layering optional conditional cache
 *  headers on top of the base UA/Accept set. NHC honours both
 *  If-Modified-Since (date) and If-None-Match (etag). Sending both
 *  costs nothing and lets the server pick the cheaper validator. */
export function buildFetchHeaders(
  state: ConditionalState,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (state.lastModified) headers["If-Modified-Since"] = state.lastModified;
  if (state.etag) headers["If-None-Match"] = state.etag;
  return headers;
}

/** Pull the validator headers off a Response. Returns nulls when the
 *  origin omits them (NHC's CDN sometimes strips ETag on cold cache). */
export function extractConditionalHeaders(res: Response): ConditionalState {
  return {
    lastModified: res.headers.get("last-modified"),
    etag: res.headers.get("etag"),
  };
}

/** Hash the (id, advisoryNumber) pairs for every active storm so a
 *  poll that returns identical advisories can skip the cache body
 *  replacement (and the implicit downstream notification that comes
 *  with it). The hash is deterministic-by-content: storms are sorted
 *  by id so a re-ordered upstream payload doesn't trip a false miss.
 *
 *  Why advisoryNumber instead of position/strength: an advisory is
 *  the unit of change for NHC. Two consecutive polls during a single
 *  advisory cycle return the same numbers; only when NHC issues a
 *  new advisory does the count tick. Position drifts every poll for
 *  active storms (interpolated track), so position-based hashing
 *  would defeat the dedup. */
export function computeAdvisoryHash(activeStorms: readonly unknown[]): string {
  type Sig = { id: string; advisoryNumber: string | number | null };
  const sigs: Sig[] = [];
  for (const s of activeStorms) {
    if (!s || typeof s !== "object") continue;
    const obj = s as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : null;
    if (!id) continue;
    // Live payloads carry the advisory number on publicAdvisory.advNum;
    // forecastTrack.advisoryNumber is absent, so reading only it froze the
    // hash and deduped every poll. Prefer advNum, fall back for legacy shapes.
    const pa = obj.publicAdvisory;
    const advNum =
      pa && typeof pa === "object"
        ? (pa as Record<string, unknown>).advNum
        : undefined;
    const ft = obj.forecastTrack;
    const legacyAdvNum =
      ft && typeof ft === "object"
        ? (ft as Record<string, unknown>).advisoryNumber
        : undefined;
    const advisoryNumber = advNum ?? legacyAdvNum;
    sigs.push({
      id,
      advisoryNumber:
        typeof advisoryNumber === "string" ||
        typeof advisoryNumber === "number"
          ? advisoryNumber
          : null,
    });
  }
  // Stable sort so payload order doesn't change the hash.
  sigs.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(sigs);
}

const FIXTURE_LABEL_RE = /^[a-z0-9-]+$/;

export type CyclonesFixtureOverride = { body: unknown };

export type CyclonesFixtureOptions = Readonly<{
  enabled: boolean;
  label: string | undefined;
}>;

let cyclonesFixtureOptions: CyclonesFixtureOptions = {
  enabled: false,
  label: undefined,
};

export function __setCyclonesFixtureOptionsForTests(
  opts: CyclonesFixtureOptions,
): void {
  cyclonesFixtureOptions = opts;
}

export async function resolveCyclonesFixtureOverride(
  opts: CyclonesFixtureOptions = cyclonesFixtureOptions,
): Promise<CyclonesFixtureOverride | null> {
  if (!opts.enabled) return null;
  if (!opts.label) return null;
  if (!FIXTURE_LABEL_RE.test(opts.label)) {
    throw new Error(`Invalid CYCLONES_FIXTURE value: ${opts.label}`);
  }
  const path = `tests/fixtures/cyclones/${opts.label}.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Fixture not found: ${path}`);
  }
  return { body: await file.json() };
}

// ── Fetch pipeline ───────────────────────────────────────────────────

/** Run a single poll cycle: fixture override → season gate → live
 *  conditional fetch → cache update. Internal entry point for the
 *  setInterval driver in startCyclonesPolling(). Exported so the
 *  spec can drive a sequence of mocked-fetch ticks (200 → 304 → 200,
 *  validator-header round-trip, etc.) without spinning the timer.
 *
 *  `now` is exposed only so the spec can inject an in-season date
 *  when exercising the conditional-fetch loop year-round. Production
 *  callers omit it; the default reads the live wall clock. */
export async function fetchCyclones(now: Date = new Date()): Promise<void> {
  // Dev-only fixture short-circuit — see resolveCyclonesFixtureOverride.
  // Errors from the override (invalid label, missing file) are surfaced
  // through the same cache.error channel as a live-fetch failure.
  try {
    const override = await resolveCyclonesFixtureOverride();
    if (override) {
      const normalized = normalizeCyclonesPayload(override.body);
      if (!normalized) {
        cache = { ...cache, error: "Fixture has invalid shape" };
        logger.warn("🌀 NHC: fixture override rejected (bad shape)");
        return;
      }
      cache = {
        body: normalized,
        fetchedAt: Date.now(),
        stormCount: normalized.activeStorms.length,
        error: null,
      };
      logger.info(
        `🌀 NHC: CYCLONES_FIXTURE override active (${normalized.activeStorms.length} storm(s))`,
      );
      return;
    }
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Fixture override error",
    };
    logger.warn("🌀 NHC: fixture override error");
    return;
  }

  // Season gate — out of all in-scope basin seasons AND the cache is
  // already empty → skip the live call. Non-empty cache always falls
  // through (continuity rule documented in shouldFetchCyclones).
  // Seed an empty body so /api/cyclones/latest returns 200 with
  // activeStorms: [] instead of 503 — out of season + empty IS the
  // truth, the route shouldn't surface that as a service error.
  if (!shouldFetchCyclones(cache.stormCount, now)) {
    if (cache.body === null) {
      cache = {
        body: { activeStorms: [] },
        fetchedAt: Date.now(),
        stormCount: 0,
        error: null,
      };
    }
    logger.info(
      "🌀 NHC: skipping fetch — no active-basin season open and cache is empty",
    );
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NHC_URL, {
      signal: controller.signal,
      headers: buildFetchHeaders(conditionalState),
    });
    await processCyclonesResponse(res);
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
    logger.warn("🌀 NHC: fetch error");
  } finally {
    clearTimeout(timer);
  }
}

/** Branch on a fetched Response: 304 / non-OK / parse + normalize +
 *  dedup + cache update. Extracted from fetchCyclones to keep the
 *  outer function under the cognitive-complexity gate. */
async function processCyclonesResponse(res: Response): Promise<void> {
  // 304 Not Modified — payload is unchanged. Update fetchedAt so the
  // freshness clock resets, but leave body/stormCount/headers alone.
  // No parse, no downstream notification.
  if (res.status === 304) {
    cache = { ...cache, fetchedAt: Date.now(), error: null };
    logger.info("🌀 NHC: 304 not modified — cache fresh");
    return;
  }
  if (!res.ok) {
    cache = { ...cache, error: `NHC returned ${res.status}` };
    logger.warn(`🌀 NHC: HTTP ${res.status}`);
    return;
  }
  const json: unknown = await res.json();
  const normalized = normalizeCyclonesPayload(json);
  if (!normalized) {
    cache = { ...cache, error: "NHC response missing activeStorms array" };
    logger.warn("🌀 NHC: malformed response (no activeStorms array)");
    return;
  }
  // 200 with valid body — capture validator headers for the next
  // poll's conditional request. Headers update happens BEFORE the
  // cache replacement so an exception during cache assignment won't
  // de-sync the two pieces of state (cache empty + headers stale
  // would re-fetch the same body endlessly).
  conditionalState = extractConditionalHeaders(res);
  // Advisory dedup — if (id, advisoryNumber) pairs match the last
  // successful fetch and we already have a cached body, leave the
  // body reference alone so consumers comparing references see no
  // "change" event. Just refresh the freshness clock.
  const advisoryHash = computeAdvisoryHash(normalized.activeStorms);
  if (advisoryHash === lastAdvisoryHash && cache.body !== null) {
    cache = { ...cache, fetchedAt: Date.now(), error: null };
    logger.info("🌀 NHC: advisories unchanged — dedup, cache marked fresh");
    return;
  }
  lastAdvisoryHash = advisoryHash;
  // Stash URLs first — enrichStorms reads them back via getStormProducts.
  refreshStormProducts(normalized.activeStorms);
  await enrichStorms(normalized.activeStorms);
  // Out-of-season returns activeStorms: []. That IS the truth — accept it.
  cache = {
    body: normalized,
    fetchedAt: Date.now(),
    stormCount: normalized.activeStorms.length,
    error: null,
  };
  if (normalized.activeStorms.length > 0) {
    logger.info(
      `🌀 NHC: ${normalized.activeStorms.length} active cyclone(s) loaded`,
    );
  } else {
    logger.info("🌀 NHC: no active cyclones (out of season or quiet day)");
  }
  notifyAdvisoryChange(normalized.activeStorms);
}

/** Fire the eager-prefetch listener with the new advisory cycle's storm
 *  ids. Fire-and-forget — listener errors don't block this poll, the
 *  dossier + cone caches will still lazy-load on demand. */
function notifyAdvisoryChange(activeStorms: readonly unknown[]): void {
  if (!advisoryChangeListener || activeStorms.length === 0) return;
  const ids = collectStormIds(activeStorms);
  try {
    advisoryChangeListener(ids);
  } catch {
    // Listener failure is non-fatal.
  }
}

function collectStormIds(activeStorms: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const s of activeStorms) {
    if (!s || typeof s !== "object") continue;
    const id = (s as { id?: unknown }).id;
    if (typeof id === "string") ids.push(id.toUpperCase());
  }
  return ids;
}

/** Read a string field from a nested record on the storm object.
 *  `path` is the parent property (`publicAdvisory`, `trackCone`, etc.),
 *  `key` is the leaf (`url`, `kmzFile`). Returns undefined when the
 *  shape doesn't match — callers fall back gracefully. */
function readNestedString(
  obj: Record<string, unknown>,
  path: string,
  key: string,
): string | undefined {
  const parent = obj[path];
  if (!parent || typeof parent !== "object") return undefined;
  const value = (parent as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function extractStormProducts(s: unknown): { id: string; products: StormProducts } | null {
  if (!s || typeof s !== "object") return null;
  const obj = s as Record<string, unknown>;
  const rawId = obj.id;
  if (typeof rawId !== "string") return null;
  return {
    id: rawId.toUpperCase(),
    products: {
      advisoryUrl: readNestedString(obj, "publicAdvisory", "url"),
      discussionUrl: readNestedString(obj, "forecastDiscussion", "url"),
      windProbsUrl: readNestedString(obj, "windSpeedProbabilities", "url"),
      conekmzUrl: readNestedString(obj, "trackCone", "kmzFile"),
      trackKmzUrl: readNestedString(obj, "forecastTrack", "kmzFile"),
    },
  };
}

/** Pull per-storm direct URLs out of an activeStorms array and replace
 *  the live stash. URLs come straight from NHC's 2019 CurrentStorms.json
 *  schema (publicAdvisory / forecastDiscussion / windSpeedProbabilities
 *  / trackCone). Storms missing from the new payload are dropped. */
function refreshStormProducts(activeStorms: readonly unknown[]): void {
  stormProducts.clear();
  for (const s of activeStorms) {
    const extracted = extractStormProducts(s);
    if (extracted) stormProducts.set(extracted.id, extracted.products);
  }
}

/** Look up the per-storm direct URLs for downstream product fetches.
 *  Returns null when the storm is not in the latest CurrentStorms.json
 *  payload (storm dissipated, or never registered). */
export function getStormProducts(stormId: string): StormProducts | null {
  return stormProducts.get(stormId.toUpperCase()) ?? null;
}

/** Register the eager-prefetch hook fired on advisory-hash change. The
 *  server bootstrap (src/server/api/index.ts) wires this to warm the
 *  dossier + cone caches on each new advisory cycle. */
export function setAdvisoryChangeListener(
  listener: AdvisoryChangeListener | null,
): void {
  advisoryChangeListener = listener;
}

// ── Public API ───────────────────────────────────────────────────────

export function startCyclonesPolling(opts?: CyclonesFixtureOptions): void {
  if (intervalId) return;
  if (opts) cyclonesFixtureOptions = opts;
  logger.info("🌀 NHC: starting cyclone poll...");
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

/** TEST-ONLY: clear cache + conditional-fetch state so each test
 *  starts from a known empty baseline. Not exported through any
 *  HTTP route; tagged with the project's existing __forTests
 *  convention so the API surface stays obviously internal. */
export function __resetCyclonesCacheForTests(): void {
  cache = { body: null, fetchedAt: 0, stormCount: 0, error: null };
  conditionalState = { lastModified: null, etag: null };
  lastAdvisoryHash = null;
  stormProducts.clear();
  advisoryChangeListener = null;
}
