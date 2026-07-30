import { test, expect, type Page } from "@playwright/test";
import { mockSources, installDefaultMocks } from "./helpers/fixtures";
import { waitForCanvasFirstFrame } from "./helpers/canvas";

// ── AircraftDossier visual + field baseline ─────────────────────────
// Pins the rendered AircraftDossier so the SQLite-migration of
// aircraftEnrichment.ts cannot silently regress field surface. The
// dossier draws from two sources:
//   1. live `item.data`: the per-record enrichment attached by
//      enrichRecord (acType, registration, manufacturerName, model,
//      operator, operatorIcao, categoryDescription, military).
//   2. /api/dossier/aircraft/:icao24: hexdb-merged aircraft block
//      (Type, ICAOTypeCode, Manufacturer, Registration, RegisteredOwners).
//
// Both are mocked here so the snapshot is deterministic across runs.
// chromium-mobile is skipped because auth-flow rate-limit flakes are tracked
// separately and the desktop project is the migration's green baseline.

/** Reset the client's IndexedDB cache *and* pre-mark the walkthrough
 *  as completed before any page script runs. Two failure modes the
 *  init script defends against:
 *    1. Stale aircraft / events / fires / etc. cached in IDB from a
 *       prior real-server run hydrate ahead of our mocks, so the
 *       canvas click lands on the wrong (cached) aircraft and the
 *       OPEN IN DOSSIER button never appears.
 *    2. The first-visit walkthrough's full-screen backdrop
 *       (rgba(0,0,0,0.72)) dims the dossier mid-snapshot, blowing the
 *       0.5 % pixel-diff budget on every other run.
 *  Both are gated on the same IDB store, so we wipe-then-reseed in
 *  one async chain triggered before page scripts start. */
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

test.describe("aircraft dossier baseline", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "Visual baseline runs on chromium-desktop only.",
    );
  });

  test("dossier renders every enrichment + hexdb field with stable layout", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await mockSources(page, { aircraft: "dossier-baseline" });

    // The hexdb path mock has a complete aircraft block, no route, and no
    // photo. Photo/route are intentionally null so the snapshot doesn't
    // depend on planespotters or FlightAware availability.
    await page.route("**/api/dossier/aircraft/ae5500*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dossier: {
            icao24: "ae5500",
            aircraft: {
              ICAOTypeCode: "F35",
              Manufacturer: "LOCKHEED MARTIN",
              Registration: "TEST-N99",
              RegisteredOwners: "United States Air Force",
              Type: "F-35A Lightning II",
            },
            route: null,
            photo: null,
          },
        }),
      }),
    );

    await resetClientCacheAndSuppressWalkthrough(page);
    await page.goto("/");
    await waitForCanvasFirstFrame(page);

    // Pin all transitions / animations to instant for the duration of
    // the test. The dossier toolbar buttons (LOCATE/FOCUS/SOLO, MIL
    // badge, pane chrome) carry `transition-colors` + hover states
    // that ride a few hundred ms of motion; without this the snapshot
    // can land mid-transition and exceed the 0.5 % diff budget on
    // re-runs even though the rendered DOM is identical.
    await page.addStyleTag({
      content:
        "*, *::before, *::after { transition: none !important; animation: none !important; }",
    });

    await page.getByRole("button", { name: /search/i }).click();
    await page.getByPlaceholder("callsign, type...").fill("MAGIC01");
    const searchResult = page.getByRole("button", { name: /MAGIC01/i });
    await expect(searchResult).toBeVisible({ timeout: 10_000 });
    await searchResult.click();

    // Wait on the OPEN IN DOSSIER button in the DetailPanel rather
    // than the callsign text (the callsign also appears in Ticker
    // entries that scroll off-screen via translateX, which match
    // getByText but report `hidden`).
    const openDossierBtn = page.getByRole("button", {
      name: /open in dossier/i,
    });
    await expect(openDossierBtn).toBeVisible({ timeout: 5_000 });

    // Promote the floating DetailPanel to the full DossierPane.
    await openDossierBtn.click();

    // Resolve the dossier pane container. PaneManager wraps each leaf
    // in a div carrying data-pane-leaf-id. Scoping all subsequent
    // assertions to this container avoids picking up duplicate text in
    // the Ticker (which scrolls callsigns off-screen via translateX).
    const dossierPane = page
      .locator("[data-pane-leaf-id]")
      .filter({ has: page.getByRole("button", { name: "Close dossier" }) })
      .first();
    await expect(dossierPane).toBeVisible({ timeout: 5_000 });

    // Sections render.
    await expect(
      dossierPane.getByRole("heading", { name: "ROUTE" }),
    ).toBeVisible();
    await expect(
      dossierPane.getByRole("heading", { name: "LIVE TELEMETRY" }),
    ).toBeVisible();
    await expect(
      dossierPane.getByRole("heading", { name: "INTEL LINKS" }),
    ).toBeVisible();

    // Every row sourced from aircraftEnrichment must
    // be present. If the SQLite migration drops or mangles a field, the
    // matching expect fails before the screenshot diff runs.
    await expect(dossierPane.getByText("MAGIC01").first()).toBeVisible(); // CALLSIGN
    await expect(dossierPane.getByText("AE5500").first()).toBeVisible(); // ICAO24
    await expect(
      dossierPane.getByText("F-35A Lightning II").first(),
    ).toBeVisible(); // TYPE
    await expect(dossierPane.getByText("TEST-N99").first()).toBeVisible(); // REG
    await expect(
      dossierPane.getByText("United States Air Force").first(),
    ).toBeVisible(); // OPERATOR
    await expect(
      dossierPane.getByText("LOCKHEED MARTIN").first(),
    ).toBeVisible(); // MANUFACTURER
    await expect(dossierPane.getByText("F-35A").first()).toBeVisible(); // MODEL
    await expect(
      dossierPane.getByText("High Vortex Aircraft").first(),
    ).toBeVisible(); // CATEGORY
    await expect(dossierPane.getByText("MIL").first()).toBeVisible(); // toolbar mil badge

    // Move the cursor out of the dossier pane so hover/focus state on
    // the toolbar buttons (LOCATE/FOCUS/SOLO) doesn't bleed into the
    // snapshot. The OPEN IN DOSSIER click parks the cursor over the
    // dossier toolbar, and the resulting hover styling drifts run to
    // run. Parking at (0, 0) eliminates the variance.
    await page.mouse.move(0, 0);
    await expect
      .poll(() =>
        dossierPane
          .getByRole("button", { name: "Locate on globe" })
          .evaluate((button) => button.matches(":hover")),
      )
      .toBe(false);

    // The dossier pane snapshot is pinned at 0.5% pixel difference
    // per migration contract. The per-pixel `threshold` is loosened
    // from the default 0.2 to absorb GPU-rendering noise (subpixel
    // anti-aliasing on small fonts varies a few RGB units between
    // runs in the same Chromium profile); `maxDiffPixelRatio` stays
    // at the strict 0.5 % the contract demands.
    await expect(dossierPane).toHaveScreenshot("aircraft-dossier.png", {
      maxDiffPixelRatio: 0.005,
      threshold: 0.4,
    });
  });
});
