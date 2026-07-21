import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { POINT_LAYER_ORDER } from "@/workers/render/layerOrder";

// Worker code is now bundled TS (src/client/workers/), imported as ESM and
// built to public/workers/*.js by build.ts. Bun's test runner can't drive a
// real OffscreenCanvas, so behavioral coverage lives in Playwright. Here we
// lock the structural integration points via TS-source assertions.

const projectRoot = resolve(import.meta.dir, "../..");

async function readSource(rel: string): Promise<string> {
  return await Bun.file(resolve(projectRoot, rel)).text();
}

// ── src/client/workers/render/cyclones.ts ──────────────────────────

describe("src/client/workers/render/cyclones.ts", () => {
  test("file exists at the documented path", async () => {
    const file = Bun.file(
      resolve(projectRoot, "src/client/workers/render/cyclones.ts"),
    );
    expect(await file.exists()).toBe(true);
  });

  test("defines drawCyclone() and drawCycloneForecast()", async () => {
    const src = await readSource("src/client/workers/render/cyclones.ts");
    expect(src).toMatch(/function\s+drawCyclone\s*\(/);
    expect(src).toMatch(/function\s+drawCycloneForecast\s*\(/);
  });

  test("Saffir-Simpson scales the eye glyph (cat * 1.2)", async () => {
    const src = await readSource("src/client/workers/render/cyclones.ts");
    expect(src).toContain("saffirSimpson");
    expect(src).toContain("cat * 1.2");
  });

  test("respects motion-reduce by gating pulse on a reducedMotion arg", async () => {
    const src = await readSource("src/client/workers/render/cyclones.ts");
    // drawCyclone takes a reducedMotion flag and skips Math.sin pulses
    // when true. WCAG 2.2 AA — Hard Rule 15 (cyclone eye pulse, selection
    // ring oscillation, forecast track dash animation).
    expect(src).toContain("reducedMotion");
  });

  test("forecast rendering honors showForecast / showCone toggles", async () => {
    const src = await readSource("src/client/workers/render/cyclones.ts");
    expect(src).toContain("showForecast");
    expect(src).toContain("showCone");
  });
});

// ── src/client/workers/pointWorker.ts ──────────────────────────────

describe("src/client/workers/pointWorker.ts — cyclones integration", () => {
  test("imports the cyclones render module as bundled ESM", async () => {
    const src = await readSource("src/client/workers/pointWorker.ts");
    expect(src).toMatch(/import\s+\{[^}]*drawCyclone[^}]*\}\s+from\s+"\.\/render\/cyclones"/);
  });

  test("layerOrder draws cyclones above cyclones-forecast (eye on top of its own track)", () => {
    const forecastOrder = POINT_LAYER_ORDER.indexOf("cyclones-forecast");
    const cyclonesOrder = POINT_LAYER_ORDER.indexOf("cyclones");
    expect(forecastOrder).toBeGreaterThanOrEqual(0);
    expect(cyclonesOrder).toBeGreaterThan(forecastOrder);
  });

  test("colorMap exposes the cyclones color from the theme", async () => {
    const src = await readSource("src/client/workers/pointWorker.ts");
    const idx = src.indexOf("const colorMap");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toContain("cyclones:");
  });

  test("dispatches to drawCyclone in the points loop", async () => {
    const src = await readSource("src/client/workers/pointWorker.ts");
    expect(src).toContain('item.type === "cyclones"');
    expect(src).toContain("drawCyclone(");
  });

  test("reads cyclonesShowForecast / cyclonesShowCone / reducedMotion from frame payload", async () => {
    const src = await readSource("src/client/workers/pointWorker.ts");
    expect(src).toContain("cyclonesShowForecast");
    expect(src).toContain("cyclonesShowCone");
    expect(src).toContain("reducedMotion");
  });
});

// ── src/client/components/globe/GlobeVisualization.tsx ─────────────

describe("GlobeVisualization frame payload — cyclone wiring", () => {
  test("frame payload posts cyclonesShowForecast", async () => {
    const src = await readSource(
      "src/client/components/globe/GlobeVisualization.tsx",
    );
    expect(src).toContain("cyclonesShowForecast");
  });

  test("frame payload posts cyclonesShowCone", async () => {
    const src = await readSource(
      "src/client/components/globe/GlobeVisualization.tsx",
    );
    expect(src).toContain("cyclonesShowCone");
  });

  test("frame payload posts prefersReducedMotion (motion-reduce signal)", async () => {
    const src = await readSource(
      "src/client/components/globe/GlobeVisualization.tsx",
    );
    expect(src).toContain("prefersReducedMotion");
  });

  test("prefersReducedMotion reads window.matchMedia", async () => {
    const src = await readSource(
      "src/client/components/globe/GlobeVisualization.tsx",
    );
    expect(src).toContain("prefers-reduced-motion: reduce");
  });
});
