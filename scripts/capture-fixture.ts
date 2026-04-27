#!/usr/bin/env bun
/**
 * scripts/capture-fixture.ts
 *
 * Capture a live data snapshot into tests/fixtures/<source>/<label>.json
 * for use as an E2E / regression / off-season-development fixture.
 *
 * Fixtures are test-only and never served from public/ — anything under
 * public/ goes to the live internet, and fake storm data must not be
 * reachable from a production deploy. bun:test loads fixtures via
 * Bun.file("tests/fixtures/...").json(); Playwright mocks via
 * page.route("**\/api/cyclones/latest", ...).
 *
 * Usage:
 *   bun run scripts/capture-fixture.ts <source> <label>
 *
 *   bun run scripts/capture-fixture.ts cyclones live
 *   bun run scripts/capture-fixture.ts weather snapshot-2026-04-26
 *
 * Sources that require auth (ships / events / fires) need a local server
 * running on http://localhost:5500 (override via SIGINT_FIXTURE_SERVER env).
 *
 * SSRF (OWASP A10): the URL list is a hardcoded allowlist — `source` is
 * validated against it, never interpolated. `label` is constrained to
 * /^[a-z0-9][a-z0-9-]{0,63}$/i so the output path stays in the intended
 * directory.
 */

const USER_AGENT = "(sigint-dashboard, https://github.com/iitoneloc/sigint)";
const SERVER_BASE =
  process.env.SIGINT_FIXTURE_SERVER ?? "http://localhost:5500";

export type SourceSpec = {
  url: string;
  needsAuth?: boolean;
  headers?: Record<string, string>;
};

export const SOURCES: Record<string, SourceSpec> = {
  cyclones: {
    url: "https://www.nhc.noaa.gov/CurrentStorms.json",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  },
  aircraft: { url: `${SERVER_BASE}/api/aircraft/states`, needsAuth: true },
  weather: {
    url: "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
    headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
  },
  earthquake: {
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
    headers: { Accept: "application/geo+json" },
  },
  ships: { url: `${SERVER_BASE}/api/ships/latest`, needsAuth: true },
  events: { url: `${SERVER_BASE}/api/events/latest`, needsAuth: true },
  fires: { url: `${SERVER_BASE}/api/fires/latest`, needsAuth: true },
};

const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export function sanitizeLabel(input: string): string | null {
  if (!input) return null;
  if (!LABEL_RE.test(input)) return null;
  return input;
}

const TOKEN_COOKIE_RE = /sigint_token=[^;]+/;

async function getAuthCookie(): Promise<string> {
  const res = await fetch(`${SERVER_BASE}/api/auth/token`);
  if (!res.ok) throw new Error(`auth/token: ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("auth/token: no Set-Cookie header");
  const match = TOKEN_COOKIE_RE.exec(setCookie);
  if (!match) throw new Error("auth/token: missing sigint_token cookie");
  return match[0];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const source = args[0];
  const label = args[1];

  if (!source || !label) {
    console.error("Usage: bun run scripts/capture-fixture.ts <source> <label>");
    console.error("Sources:", Object.keys(SOURCES).join(", "));
    process.exit(1);
  }

  const spec = SOURCES[source];
  if (!spec) {
    console.error(
      `Unknown source "${source}". Valid: ${Object.keys(SOURCES).join(", ")}`,
    );
    process.exit(1);
  }

  const safeLabel = sanitizeLabel(label);
  if (!safeLabel) {
    console.error(
      `Invalid label "${label}". Must match /^[a-z0-9][a-z0-9-]{0,63}$/i.`,
    );
    process.exit(1);
  }

  const headers: Record<string, string> = { ...spec.headers };
  if (spec.needsAuth) {
    console.log(`auth: requesting cookie from ${SERVER_BASE}/api/auth/token`);
    headers.Cookie = await getAuthCookie();
  }

  console.log(`fetch: ${spec.url}`);
  const res = await fetch(spec.url, { headers });
  if (!res.ok) {
    console.error(`fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const text = await res.text();
  try {
    JSON.parse(text);
  } catch {
    console.error("response is not valid JSON; refusing to write fixture");
    process.exit(1);
  }

  const outPath = `tests/fixtures/${source}/${safeLabel}.json`;
  await Bun.write(outPath, text);
  console.log(`wrote: ${outPath} (${text.length} bytes)`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
