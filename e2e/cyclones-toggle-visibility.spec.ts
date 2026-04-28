import { test, expect, type Page } from "@playwright/test";
import { mockCyclones, installDefaultMocks } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";

// ── Cyclones toggle visibility — season-gated ─────────────────────
// The header's cyclones toggle is hidden when both:
//   1. all in-scope basins (ACTIVE_BASINS = AL/EP/CP) are out of
//      season, and
//   2. the cyclone cache is empty (no storms to show).
// Filter state lives in upstream context and is preserved across
// visibility flips — these specs verify ONLY the render-time gate.
//
// Date mocking via an offset-injection init script. Playwright's
// page.clock.install freezes setTimeout/setInterval too, which
// breaks the React provider polling and leaves the page in a
// pre-mounted state. Mocking only Date/Date.now via offset lets
// timers continue at real-time pace while `new Date()` reads from
// the synthetic baseline at React render.

async function mockWallClock(page: Page, frozenAt: Date): Promise<void> {
  const targetMs = frozenAt.getTime();
  await page.addInitScript((target) => {
    const RealDate = Date;
    const offset = target - RealDate.now();
    class FakeDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(RealDate.now() + offset);
          return;
        }
        // Forward all explicit-arg constructions to the real Date.
        super(...(args as ConstructorParameters<typeof RealDate>));
      }
      static override now(): number {
        return RealDate.now() + offset;
      }
    }
    (globalThis as Record<string, unknown>).Date = FakeDate;
  }, targetMs);
}

/** Reset the client's IndexedDB cache and pre-mark the walkthrough
 *  complete before any page script runs. Same pattern as the
 *  aircraft-dossier spec; without it stale entity hydration can
 *  push counts.cyclones above zero on a "fresh" load. */
async function resetClientCacheAndSuppressWalkthrough(
  page: Page,
): Promise<void> {
  await page.addInitScript(() => {
    const del = indexedDB.deleteDatabase("sigint-cache");
    const reseed = () => {
      const open = indexedDB.open("sigint-cache", 1);
      open.onupgradeneeded = () => {
        const database = open.result;
        if (!database.objectStoreNames.contains("cache")) {
          database.createObjectStore("cache");
        }
      };
      open.onsuccess = () => {
        const tx = open.result.transaction("cache", "readwrite");
        tx.objectStore("cache").put(true, "sigint.walkthrough.complete.v1");
      };
    };
    del.onsuccess = reseed;
    del.onerror = reseed;
    del.onblocked = reseed;
  });
}

test.describe("cyclones — toggle visibility (season-gated)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "Visibility e2e runs on chromium-desktop only.",
    );
  });

  test("out of season + empty fixture → toggle hidden", async ({ page }) => {
    // Feb 1, mid-Northern-Hemi-winter. ACTIVE_BASINS (AL/EP/CP) all
    // share the May 15 – Dec 15 window so this date is outside every
    // in-scope basin's season. Mock the clock first, then the cache
    // reset, then the API mocks — order matters because addInitScript
    // entries are applied in registration order on each navigation.
    await mockWallClock(page, new Date(Date.UTC(2026, 1, 1, 12, 0, 0)));
    await resetClientCacheAndSuppressWalkthrough(page);
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page.getByRole("button", {
      name: /toggle cyclones layer/i,
    });
    // toBeHidden() passes when the element is either CSS-hidden OR
    // not in the DOM. The render-only filter removes it from the DOM
    // entirely, so this is the precise assertion.
    await expect(toggle).toBeHidden();
  });

  test("in season + empty fixture → toggle visible", async ({ page }) => {
    // Aug 15, peak Atlantic. AL/EP/CP all in season; the helper
    // returns true even with zero storms.
    await mockWallClock(page, new Date(Date.UTC(2026, 7, 15, 12, 0, 0)));
    await resetClientCacheAndSuppressWalkthrough(page);
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    const toggle = page.getByRole("button", {
      name: /toggle cyclones layer/i,
    });
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });
});
