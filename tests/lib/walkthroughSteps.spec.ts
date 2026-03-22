import { describe, test, expect } from "bun:test";
import {
  ESSENTIAL_STEPS,
  ADVANCED_STEPS,
  ESSENTIAL_COUNT,
  ADVANCED_COUNT,
  TOTAL_STEPS,
} from "@/lib/walkthroughSteps";

describe("walkthroughSteps — essential", () => {
  test("has exactly 8 essential steps", () => {
    expect(ESSENTIAL_STEPS.length).toBe(8);
    expect(ESSENTIAL_COUNT).toBe(8);
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
      expect(["top", "bottom", "left", "right"]).toContain(step.placement);
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

  test("contains 3 action steps", () => {
    const actionSteps = ESSENTIAL_STEPS.filter((s) => s.mode === "action");
    expect(actionSteps.length).toBe(3);
  });

  test("action steps have completionCheck functions", () => {
    for (const step of ESSENTIAL_STEPS) {
      if (step.mode === "action") {
        expect(typeof step.completionCheck).toBe("function");
      }
    }
  });

  test("split-right completes when news-feed exists", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-right");
    expect(step).toBeDefined();
    expect(step!.completionCheck!(new Set(["globe"]), 1, 0)).toBe(false);
    expect(step!.completionCheck!(new Set(["globe", "news-feed"]), 2, 0)).toBe(
      true,
    );
  });

  test("split-down completes when alert-log exists with 3+ panes", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "split-down");
    expect(step).toBeDefined();
    expect(
      step!.completionCheck!(new Set(["globe", "news-feed"]), 2, 0),
    ).toBe(false);
    expect(
      step!.completionCheck!(
        new Set(["globe", "news-feed", "alert-log"]),
        3,
        0,
      ),
    ).toBe(true);
  });

  test("save-preset completes when presetCount >= 1", () => {
    const step = ESSENTIAL_STEPS.find((s) => s.id === "save-preset");
    expect(step).toBeDefined();
    expect(
      step!.completionCheck!(new Set(["globe", "news-feed", "alert-log"]), 3, 0),
    ).toBe(false);
    expect(
      step!.completionCheck!(new Set(["globe", "news-feed", "alert-log"]), 3, 1),
    ).toBe(true);
  });

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
      expect(["top", "bottom", "left", "right"]).toContain(step.placement);
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
    expect(TOTAL_STEPS).toBe(13);
  });
});
