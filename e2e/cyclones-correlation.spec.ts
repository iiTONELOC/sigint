import { test, expect } from "@playwright/test";
import { mockSources, installDefaultMocks } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";

// Cyclone correlation rules — fired by detectCycloneRules in
// lib/correlation/cyclones.ts. Each test loads a multi-source fixture
// combination that should produce one specific intel product.
//
// Coverage maps (per the cyclone E2E suite table — historical-storm
// names remapped to synthetic fixtures):
//   beryl-2024-cat5 + hunter-near-beryl   → single-cat5 + hunter-near-cyclone
//   helene-multi-2024 + sheltering-pattern → multi-storm + sheltering-pattern
//   helene-multi-2024 + helene-path-events → multi-storm + path-near-cyclone
//
// Detailed rule coverage lives in tests/lib/correlation/cyclones.spec.ts
// (12 cases). These E2E tests are smoke checks that the wired-up
// pipeline reaches the UI without regression — they verify the boot
// path completes when a fixture combination would trigger a rule.

test.describe("cyclones — correlation pipeline", () => {
  test("Hurricane Hunter inputs (Cat 5 + military aircraft) reach the UI", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockSources(page, {
      cyclones: "single-cat5",
      aircraft: "hunter-near-cyclone",
    });
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("Ships Sheltering inputs (multi-storm + 6 lee-quadrant vessels) reach the UI", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockSources(page, {
      cyclones: "multi-storm",
      ships: "sheltering-pattern",
    });
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("Cyclone-Path Events inputs (multi-storm + GDELT in cone) reach the UI", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockSources(page, {
      cyclones: "multi-storm",
      events: "path-near-cyclone",
    });
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });
});
