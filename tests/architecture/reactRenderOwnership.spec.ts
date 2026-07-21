import { describe, expect, test } from "bun:test";

const globePath =
  "src/client/components/globe/GlobeVisualization.tsx";
const frontendPath = "src/client/frontend.tsx";

describe("React render ownership", () => {
  test("keeps canvas and render-worker ownership outside React", () => {
    const source = Bun.file(globePath).text();

    return source.then((value) => {
      expect(value).not.toContain("<canvas");
      expect(value).not.toContain("transferControlToOffscreen");
      expect(value).not.toContain("new Worker");
      expect(value).not.toContain("ResizeObserver");
      expect(value).not.toContain("createInputHandlers");
      expect(value).not.toContain("projGlobe");
      expect(value).not.toContain("projFlat");
      expect(value).toContain("<RenderSurfaceHost");
    });
  });

  test("registers the render surface before React creates a root", async () => {
    const source = await Bun.file(frontendPath).text();
    expect(source.indexOf("registerRenderSurfaceElement()")).toBeGreaterThan(-1);
    expect(source.indexOf("registerRenderSurfaceElement()")).toBeLessThan(
      source.indexOf("createRoot(elem)"),
    );
  });
});
