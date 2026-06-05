import type { Page, Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Fixture helpers ────────────────────────────────────────────────
// Fixtures live under tests/fixtures/ and are NEVER served from public/.
// E2E specs load a fixture via fs.readFile + JSON.parse and inject it
// via page.route() so the browser never reaches the live network.
//
// Note on Node imports: Playwright's runner is Node-based (not Bun),
// so node:fs / node:path / node:url are the supported path here. The
// "Bun, never Node" hard rule applies to runtime/server code; the
// E2E framework was pre-approved as a Node-hosted dependency.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_ROOT = resolve(__dirname, "../../tests/fixtures");

/** Load a JSON fixture from tests/fixtures/<source>/<label>.json. */
export async function loadFixture<T = unknown>(
  source: string,
  label: string,
): Promise<T> {
  const path = resolve(FIXTURE_ROOT, source, `${label}.json`);
  const text = await readFile(path, "utf-8");
  return JSON.parse(text) as T;
}

/** Mock /api/cyclones/latest.
 *
 *  The server now enriches each storm with forecast (from TRACK.kmz) +
 *  officialCone (from CONE.kmz) BEFORE responding, so a mock must serve
 *  that ENRICHED shape — not the old fabricated inline fixtures (which
 *  encoded a forecast shape real NHC never sends). All non-empty labels
 *  resolve to one REAL captured + enriched storm (EP01 2026 Amanda); the
 *  cyclone e2e specs assert render/dossier/toggle behaviour, not a
 *  specific storm identity. "empty-out-of-season" still serves [].
 */
export async function mockCyclones(
  page: Page,
  label:
    | "empty-out-of-season"
    | "tropical-depression"
    | "subtropical-example"
    | "single-cat3"
    | "single-cat5"
    | "multi-storm",
): Promise<void> {
  const activeStorms =
    label === "empty-out-of-season"
      ? []
      : ((await loadFixture("cyclones-real", "amanda-enriched")) as {
          activeStorms?: unknown[];
        }).activeStorms ?? [];
  await page.route("**/api/cyclones/latest", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        activeStorms,
        fetchedAt: Date.now(),
        stormCount: activeStorms.length,
      }),
    }),
  );
}

/** Mock /api/aircraft/states with an aircraft fixture (adsb.fi v3 shape). */
async function mockAircraft(page: Page, label: string): Promise<void> {
  const body = await loadFixture<{ ac?: unknown[] }>("aircraft", label);
  const ac = Array.isArray(body.ac) ? body.ac : [];
  await page.route("**/api/aircraft/states", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ac,
        fetchedAt: Date.now(),
        aircraftCount: ac.length,
      }),
    }),
  );
}

/**
 * Mock multiple sources at once. Each entry maps to /api/{source}/latest
 * with the named fixture from tests/fixtures/{source}/{label}.json.
 * Aircraft is special-cased to /api/aircraft/states (post-OpenSky) and
 * cyclones to /api/cyclones/latest with the activeStorms envelope.
 */
export async function mockSources(
  page: Page,
  sources: Record<string, string>,
): Promise<void> {
  for (const [source, label] of Object.entries(sources)) {
    if (source === "cyclones") {
      await mockCyclones(page, label as Parameters<typeof mockCyclones>[1]);
      continue;
    }
    if (source === "aircraft") {
      await mockAircraft(page, label);
      continue;
    }
    const body = await loadFixture(source, label);
    await page.route(`**/api/${source}/latest`, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    );
  }
}

/** Install default-empty route mocks for every server-proxy `/api/*`
 *  endpoint AND every direct-upstream URL the client fetches. Tests
 *  call this BEFORE any specific mock and BEFORE `page.goto`. Specific
 *  mocks added afterwards override the defaults — Playwright's
 *  most-recently-registered route handler wins.
 *
 *  Why this exists: every e2e spec previously mocked only the feed
 *  it cared about (cyclones, aircraft) and let every other feed fall
 *  through to the prod webServer's live polling cache (adsb.fi
 *  aircraft sweeps, USGS earthquakes via direct client fetch, NWS
 *  weather via direct client fetch, NHC cyclones via server proxy,
 *  …). That coupled spec timing to the dev box's network state and
 *  caused the cyclones-forecast-click flake (live aircraft colliding
 *  with the projected forecast point on the canvas hit-test). With
 *  default-empty mocks installed first, every feed answers with a
 *  shape-correct empty payload until the test explicitly overrides
 *  the one it cares about. */
export async function installDefaultMocks(page: Page): Promise<void> {
  const json = (body: unknown): Parameters<Route["fulfill"]>[0] => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  const now = Date.now();

  // Server-proxy endpoints — shapes mirror src/server/api/index.ts.
  await page.route("**/api/cyclones/latest", (route) =>
    route.fulfill(
      json({ activeStorms: [], fetchedAt: now, stormCount: 0 }),
    ),
  );
  await page.route("**/api/aircraft/states", (route) =>
    route.fulfill(
      json({ ac: [], fetchedAt: now, aircraftCount: 0, error: null }),
    ),
  );
  await page.route("**/api/events/latest", (route) =>
    route.fulfill(json({ data: [], fetchedAt: now })),
  );
  await page.route("**/api/ships/latest", (route) =>
    route.fulfill(json({ data: [], vesselCount: 0, connected: false })),
  );
  await page.route("**/api/fires/latest", (route) =>
    route.fulfill(json({ data: [], fetchedAt: now, fireCount: 0 })),
  );
  await page.route("**/api/news/latest", (route) =>
    route.fulfill(json({ items: [], fetchedAt: now, itemCount: 0 })),
  );

  // Direct-upstream fetches the client makes without going through
  // /api/* — earthquakes from USGS, weather alerts from NWS. Match
  // the GeoJSON FeatureCollection shape both providers expect.
  await page.route("**/earthquake.usgs.gov/**", (route) =>
    route.fulfill(json({ type: "FeatureCollection", features: [] })),
  );
  await page.route("**/api.weather.gov/**", (route) =>
    route.fulfill(json({ type: "FeatureCollection", features: [] })),
  );
}

/** Mock NHC text products for cyclone dossier tests (v1.1). */
export async function mockCycloneDossier(
  page: Page,
  stormId: string,
  dossier: object,
): Promise<void> {
  await page.route(`**/api/dossier/cyclone/${stormId}`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ dossier }),
    }),
  );
}
