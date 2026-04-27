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

/** Mock /api/cyclones/latest with a cyclone fixture. */
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
  const body = await loadFixture("cyclones", label);
  await page.route("**/api/cyclones/latest", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        activeStorms: (body as { activeStorms?: unknown[] }).activeStorms ?? [],
        fetchedAt: Date.now(),
        stormCount: (
          (body as { activeStorms?: unknown[] }).activeStorms ?? []
        ).length,
      }),
    }),
  );
}

/**
 * Mock multiple sources at once. Each entry maps to /api/{source}/latest
 * with the named fixture from tests/fixtures/{source}/{label}.json.
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
