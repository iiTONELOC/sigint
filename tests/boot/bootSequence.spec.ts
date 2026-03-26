import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(import.meta.dir, "../..");
const frontendSource = fs.readFileSync(
  path.join(projectRoot, "src/client/frontend.tsx"),
  "utf-8",
);

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
      "muteProviders()",
      hydrateBlock,
    );
    expect(muteBefore).toBeGreaterThan(-1);

    // restoreAndNotify must appear after hydrate
    const restoreAfter = frontendSource.indexOf(
      "restoreAndNotify(saved)",
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
      "muteProviders()",
      refreshBlock,
    );
    expect(muteBefore).toBeGreaterThan(-1);

    // restoreAndNotify must appear after refresh
    const restoreAfter = frontendSource.indexOf(
      "restoreAndNotify(",
      refreshBlock,
    );
    expect(restoreAfter).toBeGreaterThan(-1);
  });

  // ── Metadata DB loads before refresh ────────────────────────────
  test("ensureMetadataDb is awaited before network refresh", () => {
    const metaDbIdx = frontendSource.indexOf("ensureMetadataDb");
    const refreshIdx = frontendSource.indexOf(
      "await Promise.all(staleProviders.map((p) => p.refresh()",
    );
    expect(metaDbIdx).toBeGreaterThan(-1);
    expect(refreshIdx).toBeGreaterThan(-1);
    expect(metaDbIdx).toBeLessThan(refreshIdx);
  });

  // ── All providers included ──────────────────────────────────────
  test("all 7 providers are in the providers array", () => {
    expect(frontendSource).toContain("shipProvider");
    expect(frontendSource).toContain("gdeltProvider");
    expect(frontendSource).toContain("fireProvider");
    expect(frontendSource).toContain("weatherProvider");
    expect(frontendSource).toContain("earthquakeProvider");
    expect(frontendSource).toContain("newsProvider");
    expect(frontendSource).toContain("aircraftProvider");
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
  test("exactly two restoreAndNotify(saved) calls (hydrate batch + conditional refresh batch)", () => {
    const matches = frontendSource.match(/restoreAndNotify\(saved\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });
});
