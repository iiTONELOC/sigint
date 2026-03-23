import { describe, test, expect } from "bun:test";

// ── Touch target CSS class ────────────────────────────────────────────

describe("touch-target class in index.css", () => {
  test("touch-target is inside pointer coarse media query (touch only)", async () => {
    const css = await Bun.file("src/index.css").text();
    const touchTargetIdx = css.indexOf(".touch-target {");
    const mediaIdx = css.indexOf("@media (pointer: coarse)");
    expect(touchTargetIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(-1);
    expect(touchTargetIdx).toBeGreaterThan(mediaIdx);
  });

  test("touch-target sets 36px min dimensions", async () => {
    const css = await Bun.file("src/index.css").text();
    expect(css).toContain("min-height: 36px");
    expect(css).toContain("min-width: 36px");
  });
});

// ── Touch target usage in components ──────────────────────────────────

describe("touch-target on interactive elements", () => {
  test("PaneHeader buttons use touch-target", async () => {
    const src = await Bun.file("src/client/panes/PaneHeader.tsx").text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(4);
  });

  test("AlertLogPane filter buttons use touch-target", async () => {
    const src = await Bun.file(
      "src/client/panes/alert-log/AlertLogPane.tsx",
    ).text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(3);
  });

  test("DataTablePane filter buttons use touch-target", async () => {
    const src = await Bun.file(
      "src/client/panes/data-table/DataTablePane.tsx",
    ).text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(2);
  });

  test("IntelFeedPane filter buttons use touch-target", async () => {
    const src = await Bun.file(
      "src/client/panes/intel-feed/IntelFeedPane.tsx",
    ).text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toContain("touch-target touch-target");
  });

  test("NewsFeedPane filter buttons use touch-target", async () => {
    const src = await Bun.file(
      "src/client/panes/news-feed/NewsFeedPane.tsx",
    ).text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(2);
  });

  test("VideoFeedPane toolbar buttons use touch-target", async () => {
    const src = await Bun.file(
      "src/client/panes/video-feed/VideoFeedPane.tsx",
    ).text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(3);
  });

  test("LayoutPresetMenu action buttons use touch-target", async () => {
    const src = await Bun.file("src/client/panes/LayoutPresetMenu.tsx").text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(3);
  });

  test("VideoFeed PresetMenu action buttons use touch-target", async () => {
    const src = await Bun.file(
      "src/client/panes/video-feed/PresetMenu.tsx",
    ).text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(3);
  });

  test("Header buttons use touch-target", async () => {
    const src = await Bun.file("src/client/components/Header.tsx").text();
    expect(src.match(/touch-target/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

// ── PaneHeader flex-wrap ──────────────────────────────────────────────

describe("PaneHeader stacking", () => {
  test("PaneHeader outer container has flex-wrap", async () => {
    const src = await Bun.file("src/client/panes/PaneHeader.tsx").text();
    expect(src).toContain("flex flex-wrap");
  });
});

// ── Resize handle touch ──────────────────────────────────────────────

describe("ResizeHandle touch sizing", () => {
  test("ResizeHandle uses touch-resize class", async () => {
    const src = await Bun.file("src/client/panes/ResizeHandle.tsx").text();
    expect(src).toContain("touch-resize");
  });

  test("touch-resize styles exist in CSS", async () => {
    const css = await Bun.file("src/index.css").text();
    expect(css).toContain(".touch-resize.cursor-col-resize");
    expect(css).toContain(".touch-resize.cursor-row-resize");
  });
});

// ── Detail panel drag uses window listeners ──────────────────────────

describe("DetailPanel touch drag", () => {
  test("useDrag uses window pointermove listeners", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain('window.addEventListener("pointermove"');
    expect(src).toContain('window.addEventListener("pointerup"');
    expect(src).toContain('window.addEventListener("pointercancel"');
  });

  test("drag handle has touch-action none", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("touchAction");
  });

  test("panel div does NOT have onPointerMove", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).not.toContain("onPointerMove={drag.");
    expect(src).not.toContain("onPointerUp={drag.");
  });
});

// ── Detail panel snap sheet ──────────────────────────────────────────

describe("DetailPanel snap sheet", () => {
  test("has SNAP_HEIGHTS constant with 3 values", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("SNAP_HEIGHTS");
    expect(src).toMatch(/SNAP_HEIGHTS\s*=\s*\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]/);
  });

  test("heightRef prevents infinite re-render", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("heightRef.current");
  });

  test("reset guards setHeightVh", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("heightRef.current !== SNAP_HEIGHTS[1]");
  });

  test("MobileScrollHint component exists", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("MobileScrollHint");
  });
});

// ── Speed slider touch ───────────────────────────────────────────────

describe("Speed slider touch", () => {
  test("rotation speed slider has touch-action none", async () => {
    const src = await Bun.file(
      "src/client/panes/live-traffic/LiveTrafficPane.tsx",
    ).text();
    expect(src).toContain("touchAction");
  });
});

// ── Ticker independence from filters ─────────────────────────────────

describe("Ticker filter independence", () => {
  test("buildTickerItems takes only allData param", async () => {
    const src = await Bun.file("src/client/lib/tickerFeed.ts").text();
    expect(src).toContain(
      "export function buildTickerItems(allData: DataPoint[])",
    );
    expect(src).not.toContain("_filters");
    expect(src).not.toContain("_layers");
  });

  test("tickerItems memo does not depend on filters or layers", async () => {
    const src = await Bun.file("src/client/context/DataContext.tsx").text();
    const idx = src.indexOf("buildTickerItems(allData)");
    expect(idx).toBeGreaterThan(-1);
    const after = src.slice(idx, idx + 100);
    expect(after).toContain("[allData]");
    expect(after).not.toContain("filters");
    expect(after).not.toContain("layers");
  });
});
