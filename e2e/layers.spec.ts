import { test, expect } from "@playwright/test";
import { mockCyclones, installDefaultMocks } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";
import { axeScan } from "./helpers/axe";

// Layer toggles control which feature types render. The header exposes
// one toggle button per feature with `aria-label="Toggle <feature> layer"`
// and `aria-pressed` reflecting state (Header.tsx LayerToggle, fixed in
// step 11/15 — Hard Rule 11 in-scope a11y fix).

test.describe("layer toggles", () => {
  test("cyclone layer toggle is reachable + has accessible name", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "single-cat5");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const cyclones = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(cyclones).toBeVisible();
    // Currently on by default — aria-pressed must be true.
    await expect(cyclones).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking the cyclone layer toggle flips aria-pressed", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "single-cat5");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const button = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    // Wait for cyclones to populate — the season-gated visibility
    // filter holds the toggle out of the DOM until counts.cyclones
    // flips above 0. 10 s matches the rendering tests' ceiling.
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("layers panel passes axe (WCAG 2.2 AA)", async ({ page }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "single-cat5");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const { violations } = await axeScan(page);
    expect(violations).toEqual([]);
  });
});
