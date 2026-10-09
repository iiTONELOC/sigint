import { test, expect } from "@playwright/test";
import { mockCyclones, installDefaultMocks } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";

test.describe("service worker", () => {
  test("registers /sw.js on first load", async ({ page }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!reg.active } : null;
    });
    expect(registration).not.toBeNull();
    expect(registration?.scope).toContain("localhost");
  });
});
