import { test, expect } from "@playwright/test";
import { mockCyclones } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";
import { axeScan } from "./helpers/axe";

// Boot sequence: cacheInit → IDB hydration → first paint. App becomes
// interactive within the spec timeout, no console errors, and the
// initial render passes WCAG 2.2 AA via axe.

test.describe("boot sequence", () => {
  test("renders shell + canvas without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await mockCyclones(page, "empty-out-of-season");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();

    // Filter known-benign messages: SW updates, autoplay nags, 404s for
    // optional assets like favicon.
    const real = consoleErrors.filter(
      (m) =>
        !m.includes("SW_") &&
        !m.includes("Service Worker") &&
        !m.toLowerCase().includes("autoplay") &&
        !m.includes("404") &&
        !m.includes("favicon"),
    );
    expect(real).toEqual([]);
  });

  test("initial render passes WCAG 2.2 AA (axe)", async ({ page }) => {
    await mockCyclones(page, "empty-out-of-season");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const { violations } = await axeScan(page);
    expect(violations).toEqual([]);
  });
});
