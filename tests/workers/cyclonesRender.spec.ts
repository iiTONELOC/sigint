import { describe, test, expect } from "bun:test";
import { resolve } from "path";

// Worker code is plain JS served from public/workers/. It can't import
// from the main bundle, and Bun's test runner can't drive it through a
// real OffscreenCanvas. Behavioral coverage of the canvas output lives
// in the Playwright suite (step 16). Here we lock the structural
// integration points in place via source assertions, mirroring the
// bootSequence.spec.ts pattern.

const projectRoot = resolve(import.meta.dir, "../..");

async function readSource(rel: string): Promise<string> {
  return await Bun.file(resolve(projectRoot, rel)).text();
}

// ── public/workers/render/cyclones.js ──────────────────────────────

describe("public/workers/render/cyclones.js", () => {
  test("file exists at the documented path", async () => {
    const file = Bun.file(
      resolve(projectRoot, "public/workers/render/cyclones.js"),
    );
    expect(await file.exists()).toBe(true);
  });

  test("defines drawCyclone() and drawCycloneForecast()", async () => {
    const src = await readSource("public/workers/render/cyclones.js");
    expect(src).toMatch(/function\s+drawCyclone\s*\(/);
    expect(src).toMatch(/function\s+drawCycloneForecast\s*\(/);
  });

  test("Saffir-Simpson scales the eye glyph (cat * 1.2)", async () => {
    const src = await readSource("public/workers/render/cyclones.js");
    expect(src).toContain("saffirSimpson");
    expect(src).toContain("cat * 1.2");
  });

  test("respects motion-reduce by gating pulse on a reducedMotion arg", async () => {
    const src = await readSource("public/workers/render/cyclones.js");
    // drawCyclone takes a reducedMotion flag and skips Math.sin pulses
    // when true. WCAG 2.2 AA — Hard Rule 15 (cyclone eye pulse, selection
    // ring oscillation, forecast track dash animation).
    expect(src).toContain("reducedMotion");
  });

  test("forecast rendering honors showForecast / showCone toggles", async () => {
    const src = await readSource("public/workers/render/cyclones.js");
    expect(src).toContain("showForecast");
    expect(src).toContain("showCone");
  });
});

// ── public/workers/pointWorker.js ──────────────────────────────────

describe("public/workers/pointWorker.js — cyclones integration", () => {
  test("imports the cyclones render module via importScripts", async () => {
    const src = await readSource("public/workers/pointWorker.js");
    expect(src).toContain('importScripts("/workers/render/cyclones.js")');
  });

  test("layerOrder draws cyclones above cyclones-forecast (eye on top of its own track)", async () => {
    const src = await readSource("public/workers/pointWorker.js");
    // Forecast points must render below the eye so the eye glyph
    // visually sits above its own track.
    const forecastMatch = /"cyclones-forecast":\s*(\d+)/.exec(src);
    const cyclonesMatch = /cyclones:\s*(\d+)\b/.exec(src);
    expect(forecastMatch).not.toBeNull();
    expect(cyclonesMatch).not.toBeNull();
    const forecastOrder = Number.parseInt(forecastMatch![1] ?? "0", 10);
    const cyclonesOrder = Number.parseInt(cyclonesMatch![1] ?? "0", 10);
    expect(cyclonesOrder).toBeGreaterThan(forecastOrder);
  });

  test("colorMap exposes the cyclones color from the theme", async () => {
    const src = await readSource("public/workers/pointWorker.js");
    const idx = src.indexOf("var colorMap");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toContain("cyclones:");
  });

  test("dispatches to drawCyclone in the points loop", async () => {
    const src = await readSource("public/workers/pointWorker.js");
    expect(src).toContain('item.type === "cyclones"');
    expect(src).toContain("drawCyclone(");
  });

  test("reads cyclonesShowForecast / cyclonesShowCone / reducedMotion from frame payload", async () => {
    const src = await readSource("public/workers/pointWorker.js");
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
