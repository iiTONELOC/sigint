import { test, expect } from "@playwright/test";
import {
  CycloneFixture,
  installDefaultMocks,
  mockCyclones,
} from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";
import { axeScan } from "./helpers/axe";

// Cyclone render coverage. Fixture names map to the synthetic v1.0 set:
//   spec original          → fixture used here
//   beryl-2024-cat5        → single-cat5
//   milton-2024-rapid      → single-cat3
//   helene-multi-2024      → multi-storm
//   otis-2023-epac         → single-cat5

test.describe("cyclone rendering", () => {
  test("single-cat5 fixture boots and reveals the cyclone toggle", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.SingleCategoryFive);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    // Smoke: cyclone provider data flows through DataContext + featureRegistry
    // far enough that the Header's cyclone layer toggle renders.
    // (Strict console-error coverage lives in boot.spec.ts.)
    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("empty fixture boots cleanly through the complete-empty path", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.EmptyOutOfSeason);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);
  });

  test("multi-storm fixture boots and reveals the cyclone toggle", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.MultiStorm);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("cyclones layer toggle hides the layer", async ({ page }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.SingleCategoryFive);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    // Wait for the cyclones data to populate before checking
    // aria-pressed. The season-gated filter holds the toggle out of
    // the DOM until counts.cyclones flips above 0 (cold-start
    // hydration takes ~1–2 s on the prod server). 10 s matches the
    // ceiling on the other single-cat5 tests in this file.
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("cyclones layer toggle has accessible name (axe-friendly)", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.SingleCategoryFive);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    // Whole-page scan; the new cyclone toggle must not introduce
    // any new a11y violations beyond the documented allowlist.
    const { violations } = await axeScan(page);
    expect(violations).toEqual([]);
  });
});
