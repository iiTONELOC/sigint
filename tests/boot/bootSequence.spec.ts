import { describe, test, expect } from "bun:test";
import { resolve } from "path";

const projectRoot = resolve(import.meta.dir, "../..");
const frontendSource = await Bun.file(
  `${projectRoot}/src/client/frontend.tsx`,
).text();

describe("Boot sequence (frontend.tsx)", () => {
  // Render the shell before any data work — globe interactive from frame zero.
  test("createRoot().render() runs before cacheReady is consumed", () => {
    const renderIdx = frontendSource.indexOf("createRoot(elem).render(app)");
    const cacheReadyUse = frontendSource.indexOf("cacheReady.then");
    expect(renderIdx).toBeGreaterThan(-1);
    expect(cacheReadyUse).toBeGreaterThan(-1);
    expect(renderIdx).toBeLessThan(cacheReadyUse);
  });

  test("cacheInit() is called at module scope (fires at import time)", () => {
    expect(frontendSource).toMatch(/^const cacheReady\s*=\s*cacheInit\(\)/m);
  });

  // The HOL fix: boot must NOT batch providers behind a mute/Promise.all
  // barrier — each streams in independently.
  test("boot does not mute/unmute providers as a batch", () => {
    expect(frontendSource).not.toContain("muteAll");
    expect(frontendSource).not.toContain("unmuteAll");
  });

  test("boot does not await all providers behind a Promise.all barrier", () => {
    expect(frontendSource).not.toContain("Promise.all(providers");
    expect(frontendSource).not.toContain("staleProviders.map((p) => p.refresh()");
  });

  // Per-provider streaming: each provider hydrates then refreshes on its own.
  test("boot iterates providers and hydrates + refreshes each independently", () => {
    expect(frontendSource).toContain("for (const p of providers)");
    expect(frontendSource).toContain("p.hydrate()");
    expect(frontendSource).toContain("p.refresh()");
  });

  // Auth is fetched once up front but does not gate first paint.
  test("auth token is fetched once, not per provider", () => {
    const matches = frontendSource.match(/ensureAuthCookie\(\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  test("ensureMetadataDb is not referenced from frontend.tsx", () => {
    expect(frontendSource).not.toContain("ensureMetadataDb");
  });

  test("all 7 providers are in the providers array", () => {
    for (const name of [
      "shipProvider",
      "gdeltProvider",
      "fireProvider",
      "weatherProvider",
      "newsProvider",
      "aircraftProvider",
      "cycloneProvider",
    ]) {
      expect(frontendSource).toContain(name);
    }
  });

  test("no `as any[]` cast on providers", () => {
    expect(frontendSource).not.toContain("as any[]");
  });

  // Only stale/missing providers refresh; fresh cache skips the network.
  test("refresh is gated on staleness, not run unconditionally", () => {
    expect(frontendSource).toContain("needsRefresh");
  });
});
