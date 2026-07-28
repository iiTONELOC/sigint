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
    const cacheReadyUse = frontendSource.indexOf("await cacheReady");
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

  // Per-provider streaming: each hydrates then refreshes on its own, and they
  // all start together rather than one waiting on the last.
  test("boot streams every provider concurrently, hydrate then refresh", () => {
    expect(frontendSource).toContain("providers.map(streamProvider)");
    expect(frontendSource).toContain("provider.hydrate()");
    expect(frontendSource).toContain("provider.refresh()");
  });

  // Auth is fetched once up front but does not gate first paint.
  test("auth token is fetched once, not per provider", () => {
    const matches = frontendSource.match(/ensureAuthCookie\(\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  test("ensureMetadataDb is not referenced from frontend.tsx", () => {
    expect(frontendSource).not.toContain("ensureMetadataDb");
  });

  test("news is the only provider React boots", () => {
    expect(frontendSource).toContain("newsProvider");
    expect(frontendSource).toContain("const providers = [newsProvider]");
  });

  test("no point source is booted from React", () => {
    for (const name of [
      "shipProvider",
      "gdeltProvider",
      "weatherProvider",
      "aircraftProvider",
      "cycloneProvider",
    ]) {
      expect(frontendSource).not.toContain(name);
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
