import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ── Regression guard: no live upstream URLs in test specs ──────────
// Walks tests/ and e2e/ trees, fails if any spec line references a
// third-party upstream host. Only string-equality assertions on a
// short whitelist of module-constant URLs are allowed (so existing
// `expect(NHC_URL).toBe(...)` tests can keep validating the constant
// is correct without tripping this guard).
//
// Why this exists: the cyclones-forecast-click flake earlier in the
// session was caused by a live aircraft flow (no page.route mock)
// colliding with the canvas hit-test for a synthetic forecast point.
// All e2e specs now call installDefaultMocks(page) which default-
// empties every server-proxy `/api/*` endpoint AND the direct-
// upstream URLs (USGS, NWS) the client hits without a server proxy.
// This guard prevents a future spec from re-introducing a live call.

const REPO_ROOT = join(import.meta.dir, "..", "..");

// Hosts the suite must never contact during test runs. Each entry is
// a hostname fragment that triggers the guard.
const FORBIDDEN_HOSTS = [
  "nhc.noaa.gov",
  "opensky-network.org",
  "opendata.adsb.fi",
  "earthquake.usgs.gov",
  "api.weather.gov",
  "gdeltproject.org",
  "firms.modaps.eosdis.nasa.gov",
  "aisstream.io",
  "nrlmry.navy.mil",
  "metoc.navy.mil",
];

// Allowlist: lines that REFERENCE a forbidden host but are fine
// because they're (a) string equality on a module constant the test
// is checking, (b) fetch-mock URL routing inside a globalThis.fetch
// override, (c) CSP header assertions, (d) fixture-data display
// fields the UI renders as a link, or (e) proof-of-no-fetch
// assertions. Each entry is a substring match; the entire matching
// line is exempted from the guard.
const ALLOWED_LINE_SUBSTRINGS = [
  // Fetch-mock URL routing inside a `globalThis.fetch =` override.
  // These INTERCEPT the URL, never call the upstream.
  "url.includes(",
  "mockResponses.set(",
  // Assertions about the URL the mock saw (proves no live fetch).
  "expect(lastCalledUrl)",
  // CSP header assertions in securityHeaders.spec.ts — verify the
  // server's Content-Security-Policy includes/excludes upstream
  // hosts as connect-src origins. Not a fetch.
  "expect(csp)",
  // CSP-related comments referencing the host.
  "CSP no longer needs",
  // Module-constant string-equality assertions in cache specs.
  "expect(NHC_URL).toBe",
  "expect(ADSB_BASE_URL).toBe",
  "SOURCES.cyclones?.url",
  "SOURCES.weather?.url",
  "SOURCES.earthquake?.url",
  // captureFixture's SOURCES allowlist URLs are validated in the
  // capture-fixture spec; the asserts read but never fetch them.
  'SOURCES["',
  // The expected-value line of captureFixture's `expect(...).toBe(URL)`
  // pair — line 23 is the string literal, line 22 already matches via
  // SOURCES.cyclones?.url. Allowlisted by exact URL.
  '"https://www.nhc.noaa.gov/CurrentStorms.json"',
  // Fixture-data fields: USGS event-page links surfaced in DetailPanel
  // intel rows; they are href values, never fetch targets in tests.
  '"https://earthquake.usgs.gov/earthquakes/eventpage/',
];

const SPEC_EXT_RE = /\.spec\.tsx?$/;
const TEST_DIRS = ["tests", "e2e"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (SPEC_EXT_RE.test(entry)) {
      yield full;
    }
  }
}

function findForbiddenHosts(line: string): string[] {
  const hits: string[] = [];
  for (const host of FORBIDDEN_HOSTS) {
    if (line.includes(host)) hits.push(host);
  }
  return hits;
}

function isAllowed(line: string): boolean {
  return ALLOWED_LINE_SUBSTRINGS.some((sub) => line.includes(sub));
}

type Offender = { file: string; lineNo: number; line: string };

function scanSpecFile(file: string): Offender[] {
  const text = readFileSync(file, "utf-8");
  const lines = text.split("\n");
  const out: Offender[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (findForbiddenHosts(line).length === 0) continue;
    if (isAllowed(line)) continue;
    out.push({ file: relative(REPO_ROOT, file), lineNo: i + 1, line: line.trim() });
  }
  return out;
}

function collectOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const dir of TEST_DIRS) {
    for (const file of walk(join(REPO_ROOT, dir))) {
      // Skip THIS file — it lists every forbidden host by definition.
      if (file.endsWith("no-live-network.spec.ts")) continue;
      offenders.push(...scanSpecFile(file));
    }
  }
  return offenders;
}

describe("no-live-network: spec tree audit", () => {
  test("no test/spec file references a forbidden upstream host", () => {
    const offenders = collectOffenders();
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  ${o.file}:${o.lineNo}\n    ${o.line}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} spec line(s) referencing a forbidden upstream host:\n${report}\n` +
          `Mock the upstream via page.route (e2e) or globalThis.fetch override (bun test). ` +
          `If the line is a string-equality assertion on a module constant or fixture data field, ` +
          `add it to ALLOWED_LINE_SUBSTRINGS in tests/integration/no-live-network.spec.ts.`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
