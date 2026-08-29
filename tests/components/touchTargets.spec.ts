import { describe, test, expect } from "bun:test";

const MINIMUM_TOUCH_TARGETS_BY_PATH: Readonly<Record<string, number>> = {
  "src/client/panes/alert-log/AlertLogPane.tsx": 3,
  "src/client/panes/data-table/components/DataTableToolbar.tsx": 2,
  "src/client/panes/intel-feed/components/IntelFeedToolbar.tsx": 3,
  "src/client/panes/news-feed/NewsFeedPane.tsx": 2,
  "src/client/panes/video-feed/VideoFeedPane.tsx": 3,
  "src/client/panes/LayoutPresetMenu.tsx": 3,
  "src/client/panes/video-feed/PresetMenu.tsx": 3,
  "src/client/components/Header.tsx": 2,
};

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

  test("touch-target uses the 44px control target", async () => {
    const css = await Bun.file("src/index.css").text();
    expect(css).toContain("--control-target-size: 44px");
    expect(css).toContain("min-height: var(--control-target-size)");
    expect(css).toContain("min-width: var(--control-target-size)");
  });
});

// ── Touch target usage in components ──────────────────────────────────

describe("touch-target on interactive elements", () => {
  test("interactive owners use touch-target", async () => {
    for (const [path, minimum] of Object.entries(
      MINIMUM_TOUCH_TARGETS_BY_PATH,
    )) {
      const source = await Bun.file(path).text();
      expect((source.match(/touch-target/g) ?? []).length).toBeGreaterThanOrEqual(
        minimum,
      );
    }
  });

  test("IntelFeedPane does not repeat touch-target", async () => {
    const source = await Bun.file(
      "src/client/panes/intel-feed/components/IntelFeedToolbar.tsx",
    ).text();
    expect(source).not.toContain("touch-target touch-target");
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
  test("drag handle has touch-action none", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("touch-none");
  });

  test("panel div does NOT have onPointerMove", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).not.toContain("onPointerMove={drag.");
    expect(src).not.toContain("onPointerUp={drag.");
  });
});

// ── Detail panel snap sheet ──────────────────────────────────────────

describe("DetailPanel snap sheet", () => {
  test("heightRef prevents infinite re-render", async () => {
    const src = await Bun.file("src/client/components/DetailPanel.tsx").text();
    expect(src).toContain("heightRef.current");
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
    expect(src).toContain("touch-none");
  });
});
