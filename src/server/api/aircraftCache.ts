// ── adsb.fi server-side aircraft cache ───────────────────────────────
// Replaces the inline OpenSky client fetch. The browser never hits
// opendata.adsb.fi directly — the server runs a tile-based polling
// sweep here, merges + dedups results, and serves them via
// /api/aircraft/states behind guardAuth (same pattern as fires/events/
// cyclones).
//
// Why server-side:
//   - adsb.fi enforces 1 req/sec/IP. Doing this from each browser
//     would burn the per-IP budget on a single user; from the server
//     we get one shared budget across the whole user base.
//   - No CORS dependency; we proxy a same-origin response that already
//     went through guardAuth.
//   - Lets us merge tile responses once and serve the dedup'd result
//     to N clients without N×37 outbound requests.
//
// SSRF (OWASP A10): ADSB_BASE_URL is a hardcoded module constant; the
// only outbound URLs are templated from AIRCRAFT_TILES (also a module
// constant) and TILE_RADIUS_NM. No client input flows into any fetch.
//
// Sweep budget: 37 tiles × 1.1 s = 40.7 s per sweep, well inside the
// 240 s poll window. The radius (250 nm) was confirmed against the
// live v3 endpoint during the verification probe (ratio 7.73 over a
// 100 nm baseline; 500 nm returned 400, server-capped).

export const ADSB_BASE_URL = "https://opendata.adsb.fi/api/v3";
export const USER_AGENT =
  "(sigint-dashboard, https://github.com/iitoneloc/sigint)";
export const POLL_INTERVAL_MS = 240_000; // 240 s — matches existing client cadence
export const RATE_LIMIT_DELAY_MS = 1_100; // 1 req/sec/IP + small margin
export const TILE_RADIUS_NM = 250; // v3 server cap (verified)
const FETCH_TIMEOUT_MS = 30_000;

// ── 113-tile global coverage (lat, lon) ─────────────────────────────
// Dense grid: centres ≤ 6° apart in lat and ≤ 8° apart in lon over
// high-traffic regions, sparser at high latitudes / low-receiver
// areas. Each tile is a 250 nm (≈463 km) radius disc — overlapping
// neighbours produce continuous coverage with the existing hex dedup
// merging duplicates. Earlier 37-tile sparse layout left visible
// pockets between discs in the rendered globe.
//
// Sweep budget at 1.1 s/req: 113 × 1.1 = 124.3 s, fits the 240 s poll
// window with ~48% utilisation of the 1 req/sec/IP rate cap.

export const AIRCRAFT_TILES: ReadonlyArray<readonly [number, number]> = [
  // CONUS (31)
  [28, -82], // US South FL
  [28, -97], // US South TX-E
  [28, -100], // US South TX-W
  [32, -82], // US SE GA
  [32, -90], // US SE MS
  [32, -97], // US TX Central
  [32, -103], // US TX-NM
  [32, -110], // US AZ
  [32, -117], // US S CA
  [37, -76], // US Mid-Atlantic
  [37, -83], // US KY-TN
  [37, -90], // US MO
  [37, -97], // US KS
  [37, -104], // US CO
  [37, -111], // US UT
  [37, -118], // US NV-CA
  [37, -122], // US Bay Area
  [42, -71], // US New England
  [42, -78], // US NY-PA
  [42, -85], // US OH-MI
  [42, -92], // US IA-IL
  [42, -99], // US NE-SD
  [42, -106], // US WY
  [42, -113], // US ID
  [42, -120], // US OR-NV
  [46, -68], // US ME
  [46, -75], // US NY-VT
  [46, -90], // US WI-MN
  [46, -105], // US MT
  [46, -118], // US WA-OR
  [46, -122], // US Seattle
  // Canada (8)
  [50, -60], // CA NL
  [50, -75], // CA QC
  [50, -90], // CA ON-N
  [50, -105], // CA SK
  [50, -120], // CA BC
  [55, -75], // CA Hudson Bay
  [55, -100], // CA MB
  [55, -120], // CA NW BC
  // Alaska (2)
  [61, -150], // Alaska S
  [65, -150], // Alaska N
  // Mexico / Caribbean (4)
  [20, -100], // Mexico Central
  [20, -88], // Yucatan
  [18, -75], // Caribbean
  [24, -78], // Bahamas
  // South America (8)
  [-5, -55], // Brazil N
  [-10, -75], // Peru
  [-15, -47], // Brasilia
  [-20, -45], // Brazil SE
  [-23, -47], // São Paulo
  [-30, -60], // Argentina N
  [-34, -64], // Argentina C
  [-40, -65], // Patagonia
  // Europe (20)
  [40, -4], // Iberia
  [40, 4], // Med W
  [40, 12], // Italy
  [40, 22], // Greece
  [45, -2], // France W
  [45, 7], // Alps
  [45, 14], // Adriatic
  [45, 22], // Balkans
  [45, 30], // Black Sea
  [50, -2], // Channel
  [50, 5], // Benelux
  [50, 14], // Czech
  [50, 22], // Poland
  [50, 30], // Ukraine
  [55, 0], // North Sea
  [55, 12], // Denmark
  [55, 22], // Baltic
  [55, 30], // Belarus
  [60, 12], // Sweden S
  [60, 22], // Finland S
  // UK / Ireland (2)
  [53, -8], // Ireland
  [53, -2], // UK
  // Middle East / North Africa (10)
  [32, 10], // Tunisia
  [32, 25], // Egypt N
  [32, 35], // Levant
  [32, 45], // Iraq
  [32, 53], // Iran C
  [28, 50], // Gulf
  [25, 45], // Saudi C
  [25, 55], // UAE
  [38, 35], // Turkey C
  [38, 27], // Turkey W
  // Africa (6)
  [8, 4], // Nigeria
  [5, 30], // Sudan S
  [-1, 36], // Kenya
  [-15, 30], // Zambia
  [-28, 25], // South Africa N
  [-33, 18], // Cape Town
  // Asia (15)
  [22, 78], // India C
  [28, 77], // Delhi
  [15, 78], // India S
  [12, 77], // Bangalore
  [10, 105], // Vietnam
  [3, 102], // Malaysia
  [15, 105], // Thailand
  [32, 117], // China E
  [28, 112], // China S
  [38, 117], // Beijing
  [40, 116], // Beijing N
  [37, 127], // Korea
  [35, 138], // Tokyo
  [40, 140], // Japan N
  [33, 130], // Kyushu
  // Oceania (7)
  [-30, 150], // Sydney
  [-35, 145], // Melbourne
  [-25, 135], // Australia C
  [-25, 120], // Australia W
  [-32, 116], // Perth
  [-37, 175], // Auckland
  [-44, 170], // NZ S
] as const;

// ── Types ────────────────────────────────────────────────────────────

type AdsbAircraft = {
  hex?: unknown;
  [k: string]: unknown;
};

type AircraftBody = {
  /** Pass-through of adsb.fi's `ac` array. The client's parseAdsbV2.ts
   *  is the source of truth for field-level validation. */
  ac: unknown[];
};

type AircraftCache = {
  body: AircraftBody | null;
  fetchedAt: number;
  aircraftCount: number;
  error: string | null;
};

let cache: AircraftCache = {
  body: null,
  fetchedAt: 0,
  aircraftCount: 0,
  error: null,
};

let intervalId: ReturnType<typeof setInterval> | null = null;

// ── Pure helpers (testable) ─────────────────────────────────────────

/** Validate the basic shape of an adsb.fi v3 tile response.
 *  Returns the normalized body or null if the shape is wrong. */
export function normalizeAdsbPayload(json: unknown): AircraftBody | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const candidate = json as { ac?: unknown };
  if (!Array.isArray(candidate.ac)) return null;
  return { ac: candidate.ac };
}

/** Merge per-tile results into a single de-duplicated list. Tile discs
 *  overlap, so the same aircraft can appear in multiple responses. We
 *  key on lowercased hex (the ICAO 24-bit address — globally unique).
 *  Records without a usable hex are dropped; later wins so the freshest
 *  positional sample for a given aircraft survives. */
export function dedupByHex<T>(records: T[]): T[] {
  const map = new Map<string, T>();
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const hex = (rec as AdsbAircraft).hex;
    if (typeof hex !== "string" || hex.length === 0) continue;
    map.set(hex.toLowerCase(), rec);
  }
  return Array.from(map.values());
}

// ── Dev-only fixture override ────────────────────────────────────────
// `AIRCRAFT_FIXTURE=<label>` short-circuits the live tile sweep and
// returns the body of `tests/fixtures/aircraft/<label>.json`. Mirrors
// the cyclones override exactly: gated on NODE_ENV !== "production",
// label matched against /^[a-z0-9-]+$/ before any file lookup
// (OWASP A01).

const FIXTURE_LABEL_RE = /^[a-z0-9-]+$/;

export type AircraftFixtureOverride = { body: unknown };

export async function resolveAircraftFixtureOverride(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AircraftFixtureOverride | null> {
  if (env.NODE_ENV === "production") return null;
  const label = env.AIRCRAFT_FIXTURE;
  if (!label) return null;
  if (!FIXTURE_LABEL_RE.test(label)) {
    throw new Error(`Invalid AIRCRAFT_FIXTURE value: ${label}`);
  }
  const path = `tests/fixtures/aircraft/${label}.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Fixture not found: ${path}`);
  }
  return { body: await file.json() };
}

// ── Tile fetch ───────────────────────────────────────────────────────

async function fetchTile(lat: number, lon: number): Promise<unknown[]> {
  const url = `${ADSB_BASE_URL}/lat/${lat}/lon/${lon}/dist/${TILE_RADIUS_NM}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`✈️  adsb.fi tile [${lat},${lon}]: HTTP ${res.status}`);
      return [];
    }
    const json: unknown = await res.json();
    const normalized = normalizeAdsbPayload(json);
    return normalized ? normalized.ac : [];
  } catch (err) {
    console.warn(
      `✈️  adsb.fi tile [${lat},${lon}]: ${err instanceof Error ? err.message : "fetch error"}`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Fetch pipeline ───────────────────────────────────────────────────

async function fetchAircraft(): Promise<void> {
  // Dev-only fixture short-circuit — see resolveAircraftFixtureOverride.
  try {
    const override = await resolveAircraftFixtureOverride();
    if (override) {
      const normalized = normalizeAdsbPayload(override.body);
      if (!normalized) {
        cache = { ...cache, error: "Fixture has invalid shape" };
        console.warn("✈️  adsb.fi: fixture override rejected (bad shape)");
        return;
      }
      cache = {
        body: normalized,
        fetchedAt: Date.now(),
        aircraftCount: normalized.ac.length,
        error: null,
      };
      console.log(
        `✈️  adsb.fi: AIRCRAFT_FIXTURE override active (${normalized.ac.length} aircraft)`,
      );
      return;
    }
  } catch (err) {
    cache = {
      ...cache,
      error: err instanceof Error ? err.message : "Fixture override error",
    };
    console.warn("✈️  adsb.fi: fixture override error");
    return;
  }

  const merged: unknown[] = [];
  let idx = 0;
  for (const [lat, lon] of AIRCRAFT_TILES) {
    const tile = await fetchTile(lat, lon);
    merged.push(...tile);
    idx++;
    if (idx < AIRCRAFT_TILES.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  const deduped = dedupByHex(merged);

  // If the entire sweep returned nothing but we already have data, keep
  // the prior snapshot rather than briefly emptying the layer (mirrors
  // firmsCache behaviour for transient upstream issues).
  if (deduped.length === 0 && cache.body && cache.body.ac.length > 0) {
    cache = { ...cache, error: "Sweep returned 0 aircraft" };
    console.warn("✈️  adsb.fi: sweep empty — retaining stale cache");
    return;
  }

  cache = {
    body: { ac: deduped },
    fetchedAt: Date.now(),
    aircraftCount: deduped.length,
    error: null,
  };
  console.log(`✈️  adsb.fi: ${deduped.length} aircraft loaded`);
}

// ── Public API ───────────────────────────────────────────────────────

export function startAircraftPolling(): void {
  if (intervalId) return;
  console.log("✈️  adsb.fi: starting aircraft poll...");
  void fetchAircraft();
  intervalId = setInterval(() => void fetchAircraft(), POLL_INTERVAL_MS);
}

export function stopAircraftPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getAircraftCache(): AircraftCache {
  return {
    body: cache.body,
    fetchedAt: cache.fetchedAt,
    aircraftCount: cache.aircraftCount,
    error: cache.error,
  };
}
