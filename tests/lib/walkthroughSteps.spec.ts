import { describe, test, expect } from "bun:test";
import {
  ESSENTIAL_STEPS,
  ADVANCED_STEPS,
  ESSENTIAL_COUNT,
  ADVANCED_COUNT,
  TOTAL_STEPS,
} from "@/lib/walkthroughSteps";

describe("walkthroughSteps — essential", () => {
  test("has exactly 13 essential steps", () => {
    expect(ESSENTIAL_STEPS.length).toBe(13);
    expect(ESSENTIAL_COUNT).toBe(13);
  });

  test("every step has required fields", () => {
    for (const step of ESSENTIAL_STEPS) {
      expect(typeof step.id).toBe("string");
      expect(step.id.length).toBeGreaterThan(0);
      expect(typeof step.targetSelector).toBe("string");
      expect(typeof step.title).toBe("string");
      expect(step.title.length).toBeGreaterThan(0);
      expect(typeof step.description).toBe("string");
      expect(step.description.length).toBeGreaterThan(0);
      expect(["top", "bottom", "left", "right", "center"]).toContain(
        step.placement,
      );
      expect(["info", "action"]).toContain(step.mode);
    }
  });

  test("all step ids are unique", () => {
    const ids = ESSENTIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("first step is the welcome step", () => {
    expect(ESSENTIAL_STEPS[0]!.id).toBe("welcome");
    expect(ESSENTIAL_STEPS[0]!.title).toContain("Welcome");
    expect(ESSENTIAL_STEPS[0]!.mode).toBe("info");
  });

  test("action steps have completionCheck functions", () => {
    for (const step of ESSENTIAL_STEPS) {
      if (step.mode === "action") {
        expect(typeof step.completionCheck).toBe("function");
      }
    }
  });

  // ── Globe interaction sequence ──────────────────────────────────

  test("globe-select is action step that checks selectedId", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "globe-select");
    expect(step).toBeDefined();
    expect(step!.mode).toBe("action");
    expect(step!.placement).toBe("right");
    expect(step!.completionCheck!(new Set(), 1, 0, null, false, 0)).toBe(false);
    expect(step!.completionCheck!(new Set(), 1, 0, "Aabc123", false, 0)).toBe(
      true,
    );
  });

  test("globe-drag-detail is info step after globe-select", () => {
    const selectIdx = ESSENTIAL_STEPS.findIndex((s) => s.id === "globe-select");
    const dragIdx = ESSENTIAL_STEPS.findIndex(
      (s) => s.id === "globe-drag-detail",
    );
    expect(dragIdx).toBe(selectIdx + 1);
    expect(ESSENTIAL_STEPS[dragIdx]!.mode).toBe("info");
  });

  test("globe-deselect is action step that checks selectedId null", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "globe-deselect");
    expect(step).toBeDefined();
    expect(step!.mode).toBe("action");
    expect(step!.completionCheck!(new Set(), 1, 0, "Aabc123", false, 0)).toBe(
      false,
    );
    expect(step!.completionCheck!(new Set(), 1, 0, null, false, 0)).toBe(true);
  });

  test("globe sequence is in correct order", () => {
    const ids = ESSENTIAL_STEPS.map((s) => s.id);
    const selectIdx = ids.indexOf("globe-select");
    const dragIdx = ids.indexOf("globe-drag-detail");
    const deselectIdx = ids.indexOf("globe-deselect");
    expect(selectIdx).toBeGreaterThan(-1);
    expect(dragIdx).toBe(selectIdx + 1);
    expect(deselectIdx).toBe(dragIdx + 1);
  });

  // ── Focus mode sequence ─────────────────────────────────────────

  test("focus-enter checks chromeHidden true", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "focus-enter");
    expect(step).toBeDefined();
    expect(step!.mode).toBe("action");
    expect(step!.completionCheck!(new Set(), 1, 0, null, false, 0)).toBe(false);
    expect(step!.completionCheck!(new Set(), 1, 0, null, true, 0)).toBe(true);
  });

  test("focus-exit checks chromeHidden false", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "focus-exit");
    expect(step).toBeDefined();
    expect(step!.mode).toBe("action");
    expect(step!.completionCheck!(new Set(), 1, 0, null, true, 0)).toBe(false);
    expect(step!.completionCheck!(new Set(), 1, 0, null, false, 0)).toBe(true);
  });

  test("focus sequence comes after globe sequence", () => {
    const ids = ESSENTIAL_STEPS.map((s) => s.id);
    const deselectIdx = ids.indexOf("globe-deselect");
    const focusEnterIdx = ids.indexOf("focus-enter");
    expect(focusEnterIdx).toBe(deselectIdx + 1);
    expect(ids.indexOf("focus-exit")).toBe(focusEnterIdx + 1);
  });

  // ── Pane action steps ───────────────────────────────────────────

  test("split-right completes when video-feed exists", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-right");
    expect(step).toBeDefined();
    expect(step!.placement).toBe("center");
    expect(
      step!.completionCheck!(new Set(["globe"]), 1, 0, null, false, 0),
    ).toBe(false);
    expect(
      step!.completionCheck!(
        new Set(["globe", "video-feed"]),
        2,
        0,
        null,
        false,
        0,
      ),
    ).toBe(true);
  });

  test("split-down completes when alert-log exists with 3+ panes", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-down");
    expect(step).toBeDefined();
    expect(step!.placement).toBe("center");
    expect(
      step!.completionCheck!(
        new Set(["globe", "video-feed"]),
        2,
        0,
        null,
        false,
        0,
      ),
    ).toBe(false);
    expect(
      step!.completionCheck!(
        new Set(["globe", "video-feed", "alert-log"]),
        3,
        0,
        null,
        false,
        0,
      ),
    ).toBe(true);
  });

  test("save-preset completes when presetCount >= 1", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-preset");
    expect(step).toBeDefined();
    expect(step!.placement).toBe("center");
    expect(
      step!.completionCheck!(
        new Set(["globe", "video-feed", "alert-log"]),
        3,
        0,
        null,
        false,
        0,
      ),
    ).toBe(false);
    expect(
      step!.completionCheck!(
        new Set(["globe", "video-feed", "alert-log"]),
        3,
        1,
        null,
        false,
        0,
      ),
    ).toBe(true);
  });

  test("save-preset has highlightSelector for preset input", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-preset");
    expect(step).toBeDefined();
    expect(step!.highlightSelector).toBe('[data-tour="preset-input"]');
  });

  // ── Other steps ─────────────────────────────────────────────────

  test("last step is the ticker", () => {
    const last = ESSENTIAL_STEPS[ESSENTIAL_STEPS.length - 1]!;
    expect(last.id).toBe("ticker");
    expect(last.mode).toBe("info");
  });

  test("descriptions are concise (under 160 chars)", () => {
    for (const step of ESSENTIAL_STEPS) {
      expect(step.description.length).toBeLessThan(160);
    }
  });

  test("menu-spawning action steps use center placement", () => {
    const centerSteps = new Set([
      "split-right",
      "split-down",
      "save-preset",
      "focus-enter",
      "focus-exit",
    ]);
    for (const step of ESSENTIAL_STEPS) {
      if (step.mode === "action" && centerSteps.has(step.id)) {
        expect(step.placement).toBe("center");
      }
    }
  });

  test("globe action steps use right placement", () => {
    const globeSteps = ["globe-select", "globe-deselect"];
    for (const id of globeSteps) {
      const step = ESSENTIAL_STEPS.find((s) => s.id === id);
      expect(step).toBeDefined();
      expect(step!.placement).toBe("right");
    }
  });

  // ── Video preset save step ──────────────────────────────────────

  test("save-video-preset exists after save-preset", () => {
    const ids = ESSENTIAL_STEPS.map((s) => s.id);
    const saveIdx = ids.indexOf("save-preset");
    const videoIdx = ids.indexOf("save-video-preset");
    expect(videoIdx).toBe(saveIdx + 1);
  });

  test("save-video-preset checks videoPresetCount", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step).toBeDefined();
    expect(step!.mode).toBe("action");
    expect(step!.completionCheck!(new Set(), 3, 1, null, false, 0)).toBe(false);
    expect(step!.completionCheck!(new Set(), 3, 1, null, false, 1)).toBe(true);
  });

  test("save-video-preset has magenta buttonColor", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step!.buttonColor).toBe("magenta");
  });

  test("save-video-preset highlights video preset input and save button", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step!.highlightSelector).toBe('[data-tour="video-preset-input"]');
    expect(step!.tertiarySelector).toBe('[data-tour="video-preset-save-btn"]');
  });

  // ── Ring color assignments ──────────────────────────────────────

  test("split-right has yellow highlight on menu item", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-right");
    expect(step!.highlightSelector).toContain("split-menu-video-feed");
    // highlightColor defaults to "warn" when not set
    expect(step!.highlightColor).toBeUndefined();
  });

  test("split-down has danger (red) highlight on ALERTS menu item", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-down");
    expect(step!.highlightSelector).toContain("split-menu-alert-log");
    expect(step!.highlightColor).toBe("danger");
  });

  test("save-preset has amber tertiary on save button", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-preset");
    expect(step!.tertiarySelector).toBe('[data-tour="preset-save-btn"]');
    // buttonColor undefined = cyan primary, warn tertiary default
    expect(step!.buttonColor).toBeUndefined();
  });

  // ── Search step ─────────────────────────────────────────────────

  test("search step has center placement with no targetSelector", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "search");
    expect(step!.targetSelector).toBe("");
    expect(step!.placement).toBe("center");
    expect(step!.buttonSelector).toBe('[data-tour="search"]');
  });

  // ── Split-right targets video-feed ──────────────────────────────

  test("split-right expectedPaneType is video-feed", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-right");
    expect(step!.expectedPaneType).toBe("video-feed");
  });

  // ── Walkthrough layout types (for pre-tour save exclusion) ──────

  test("walkthrough creates globe + video-feed + alert-log", () => {
    // The walkthrough layout consists of these exact pane types
    const walkthroughPaneTypes = ["globe", "video-feed", "alert-log"].sort();
    // Verify via completionCheck — split-down requires all three
    const splitDown = ESSENTIAL_STEPS.find((s) => s.id === "split-down");
    expect(
      splitDown!.completionCheck!(
        new Set(walkthroughPaneTypes),
        3,
        0,
        null,
        false,
        0,
      ),
    ).toBe(true);
  });
});

describe("walkthroughSteps — advanced", () => {
  test("has exactly 5 advanced steps", () => {
    expect(ADVANCED_STEPS.length).toBe(5);
    expect(ADVANCED_COUNT).toBe(5);
  });

  test("every step has required fields", () => {
    for (const step of ADVANCED_STEPS) {
      expect(typeof step.id).toBe("string");
      expect(step.id.length).toBeGreaterThan(0);
      expect(typeof step.title).toBe("string");
      expect(step.title.length).toBeGreaterThan(0);
      expect(typeof step.description).toBe("string");
      expect(step.description.length).toBeGreaterThan(0);
      expect(["top", "bottom", "left", "right", "center"]).toContain(
        step.placement,
      );
      expect(["info", "action"]).toContain(step.mode);
    }
  });

  test("all step ids are unique", () => {
    const ids = ADVANCED_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no id overlap between essential and advanced", () => {
    const essentialIds = new Set(ESSENTIAL_STEPS.map((s) => s.id));
    for (const step of ADVANCED_STEPS) {
      expect(essentialIds.has(step.id)).toBe(false);
    }
  });

  test("final step has empty targetSelector (centered modal)", () => {
    const last = ADVANCED_STEPS[ADVANCED_STEPS.length - 1]!;
    expect(last.id).toBe("complete");
    expect(last.targetSelector).toBe("");
  });

  test("all advanced steps are info mode", () => {
    for (const step of ADVANCED_STEPS) {
      expect(step.mode).toBe("info");
    }
  });
});

describe("walkthroughSteps — constants", () => {
  test("TOTAL_STEPS = essential + advanced", () => {
    expect(TOTAL_STEPS).toBe(ESSENTIAL_COUNT + ADVANCED_COUNT);
    expect(TOTAL_STEPS).toBe(18);
  });
});

describe("walkthroughSteps — video preset step", () => {
  test("save-video-preset completionCheck uses videoPresetCount (7th param)", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step).toBeDefined();
    expect(step!.completionCheck!(new Set(), 3, 1, null, false, 0)).toBe(false);
    expect(step!.completionCheck!(new Set(), 3, 1, null, false, 1)).toBe(true);
  });

  test("save-video-preset has magenta buttonColor", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step!.buttonColor).toBe("magenta");
  });

  test("save-video-preset has magenta highlightColor", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step!.highlightColor).toBe("magenta");
  });

  test("save-video-preset targets video preset elements", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-video-preset");
    expect(step!.buttonSelector).toBe('[data-tour="video-preset-btn"]');
    expect(step!.highlightSelector).toBe('[data-tour="video-preset-input"]');
    expect(step!.tertiarySelector).toBe('[data-tour="video-preset-save-btn"]');
  });
});

describe("walkthroughSteps — watch-mode step", () => {
  test("watch-mode uses center placement so dropdown is not blocked", () => {
    const step = ADVANCED_STEPS.find((s) => s.id === "watch-mode");
    expect(step).toBeDefined();
    expect(step!.placement).toBe("center");
    expect(step!.targetSelector).toBe("");
  });

  test("watch-mode has buttonSelector for globe controls highlight", () => {
    const step = ADVANCED_STEPS.find((s) => s.id === "watch-mode");
    expect(step!.buttonSelector).toBe('[data-tour="globe-controls"]');
  });
});

describe("walkthroughSteps — complete step text", () => {
  test("complete step references Settings → Walkthrough", () => {
    const step = ADVANCED_STEPS.find((s) => s.id === "complete");
    expect(step!.description).toContain("Settings");
    expect(step!.description).toContain("Walkthrough");
    expect(step!.description).not.toContain("About");
  });
});

describe("walkthroughSteps — ticker independence", () => {
  test("buildTickerItems accepts only allData param", () => {
    // Verify the function signature — should work with 1 arg
    const { buildTickerItems } = require("@/lib/tickerFeed");
    const result = buildTickerItems([]);
    expect(Array.isArray(result)).toBe(true);
  });
});
