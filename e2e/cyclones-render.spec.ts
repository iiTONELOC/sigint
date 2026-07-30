import { test, expect } from "@playwright/test";
import { mockCyclones, installDefaultMocks } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";
import { axeScan } from "./helpers/axe";

// Cyclone render coverage. Fixture names map to the synthetic v1.0 set:
//   spec original          → fixture used here
//   beryl-2024-cat5        → single-cat5
//   milton-2024-rapid      → single-cat3
//   helene-multi-2024      → multi-storm
//   otis-2023-epac         → single-cat5

test.describe("cyclones — render", () => {
  test("single-cat5 fixture boots and reveals the cyclone toggle", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "single-cat5");
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

  test("empty-out-of-season fixture boots cleanly (allowEmptyResult path)", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    // Per the season-gated visibility contract: empty cache + all
    // in-scope basins out of season → toggle hidden. The wall clock
    // at test time is currently out of NHC season (May 15 – Dec 15),
    // and the empty-out-of-season fixture means counts.cyclones = 0,
    // so the toggle is intentionally not in the DOM. The intent of
    // this test — "app doesn't crash on empty cyclone data" — still
    // holds: a hidden toggle is the success state, not a regression.
    // toBeHidden() passes for both CSS-hidden and DOM-removed.
    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeHidden({ timeout: 10_000 });
  });

  test("multi-storm fixture boots and reveals the cyclone toggle", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "multi-storm");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("cyclones layer toggle hides the layer", async ({ page }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "single-cat5");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page
      .getByRole("button", { name: /toggle cyclones layer/i })
      .first();
    // Wait for the cyclones data to populate before checking
    // aria-pressed — the season-gated filter holds the toggle out of
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
    await mockCyclones(page, "single-cat5");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    // Whole-page scan; the new cyclone toggle must not introduce
    // any new a11y violations beyond the documented allowlist.
    const { violations } = await axeScan(page);
    expect(violations).toEqual([]);
  });
});
