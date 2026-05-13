import { describe, test, expect } from "bun:test";
import { resolve } from "path";

const projectRoot = resolve(import.meta.dir, "../..");
const frontendSource = await Bun.file(
  `${projectRoot}/src/client/frontend.tsx`,
).text();

describe("Boot sequence (frontend.tsx)", () => {
  // ── Render-first guarantee ──────────────────────────────────────
  test("createRoot().render() is called before cacheReady is awaited", () => {
    const renderIdx = frontendSource.indexOf("createRoot(elem).render(app)");
    const awaitCacheIdx = frontendSource.indexOf("await cacheReady");
    expect(renderIdx).toBeGreaterThan(-1);
    expect(awaitCacheIdx).toBeGreaterThan(-1);
    expect(renderIdx).toBeLessThan(awaitCacheIdx);
  });

  // ── cacheInit fires at import time ──────────────────────────────
  test("cacheInit() is called at module scope (not inside async function)", () => {
    // Should appear as a top-level assignment, not inside the async IIFE
    const match = frontendSource.match(
      /^const cacheReady\s*=\s*cacheInit\(\)/m,
    );
    expect(match).not.toBeNull();
  });

  // ── Mute/restore pattern ────────────────────────────────────────
  test("providers are muted before hydration and restored after", () => {
    const hydrateBlock = frontendSource.indexOf("p.hydrate()");
    expect(hydrateBlock).toBeGreaterThan(-1);

    // muteProviders must appear before hydrate
    const muteBefore = frontendSource.lastIndexOf(
      "muteAll()",
      hydrateBlock,
    );
    expect(muteBefore).toBeGreaterThan(-1);

    // restoreAndNotify must appear after hydrate
    const restoreAfter = frontendSource.indexOf(
      "unmuteAll(saved)",
      hydrateBlock,
    );
    expect(restoreAfter).toBeGreaterThan(-1);
  });

  test("providers are muted before refresh and restored after", () => {
    const refreshBlock = frontendSource.indexOf(
      "await Promise.all(staleProviders.map((p) => p.refresh()",
    );
    expect(refreshBlock).toBeGreaterThan(-1);

    // muteProviders must appear before refresh
    const muteBefore = frontendSource.lastIndexOf(
      "muteAll()",
      refreshBlock,
    );
    expect(muteBefore).toBeGreaterThan(-1);

    // unmuteAll must appear after refresh
    const restoreAfter = frontendSource.indexOf("unmuteAll(", refreshBlock);
    expect(restoreAfter).toBeGreaterThan(-1);
  });

  // ── Metadata DB no longer loads in the browser ──────────────────
  // Aircraft enrichment moved to src/server/api/aircraftEnrichment.ts;
  // the client no longer downloads or parses the 51 MB NDJSON DB.
  test("ensureMetadataDb is not referenced from frontend.tsx", () => {
    expect(frontendSource).not.toContain("ensureMetadataDb");
  });

  // ── All providers included ──────────────────────────────────────
  test("all 8 providers are in the providers array (adds cyclones in step 7)", () => {
    expect(frontendSource).toContain("shipProvider");
    expect(frontendSource).toContain("gdeltProvider");
    expect(frontendSource).toContain("fireProvider");
    expect(frontendSource).toContain("weatherProvider");
    expect(frontendSource).toContain("earthquakeProvider");
    expect(frontendSource).toContain("newsProvider");
    expect(frontendSource).toContain("aircraftProvider");
    expect(frontendSource).toContain("cycloneProvider");
  });

  test("frontend.tsx no longer needs the `as any[]` cast on providers", () => {
    expect(frontendSource).not.toContain("as any[]");
  });

  // ── No getData calls ────────────────────────────────────────────
  test("boot sequence does not call getData (uses hydrate + refresh)", () => {
    // Inside the async IIFE, there should be no getData calls
    const asyncBlock = frontendSource.slice(
      frontendSource.indexOf("(async () => {"),
    );
    expect(asyncBlock).not.toContain(".getData(");
  });

  // ── Only stale providers refreshed ───────────────────────────────
  test("network refresh only runs for stale/missing providers", () => {
    expect(frontendSource).toContain("staleProviders");
    expect(frontendSource).toContain("result.stale");
    // refresh is called on staleProviders, not all providers
    expect(frontendSource).toContain("staleProviders.map((p) => p.refresh()");
    expect(frontendSource).not.toContain("providers.map((p) => p.refresh()");
  });

  // ── Two batch updates max, no individual notifications ──────────
  test("exactly two unmuteAll(saved) calls (hydrate batch + conditional refresh batch)", () => {
    const matches = frontendSource.match(/unmuteAll\(saved\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });
});
