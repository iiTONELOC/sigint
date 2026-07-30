import { test, expect } from "@playwright/test";
import {
  CycloneFixture,
  installDefaultMocks,
  mockCyclones,
} from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";
import { axeScan } from "./helpers/axe";

// Layer toggles control which feature types render. The header exposes
// one toggle button per feature with `aria-label="Toggle <feature> layer"`
// and `aria-pressed` reflecting state (Header.tsx LayerToggle, fixed in
// step 11/15 as a Hard Rule 11 accessibility fix).

test.describe("layer toggles", () => {
  test("cyclone layer toggle is reachable + has accessible name", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.SingleCategoryFive);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const cyclones = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(cyclones).toBeVisible();
    // The layer is on by default, so aria-pressed must be true.
    await expect(cyclones).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking the cyclone layer toggle flips aria-pressed", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.SingleCategoryFive);
    await page.goto("/");
    const canvas = await waitForCanvasFirstFrame(page);

    const button = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    // Wait for cyclones to populate. The season-gated visibility
    // filter holds the toggle out of the DOM until counts.cyclones
    // flips above 0. 10 s matches the rendering tests' ceiling.
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(canvas).toBeVisible();
  });

  test("layers panel passes axe (WCAG 2.2 AA)", async ({ page }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, CycloneFixture.SingleCategoryFive);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const { violations } = await axeScan(page);
    expect(violations).toEqual([]);
  });
});
