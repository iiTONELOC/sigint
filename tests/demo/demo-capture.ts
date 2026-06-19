/**
 * SIGINT demo capture — screenshots + a short video, dark AND light.
 *
 * The video tells the "flexible workspace" story: start on the globe, select a
 * target, DRAG its detail panel, then split into a video feed (4 curated
 * channels) and an intel pane — driven with real Playwright mouse drags against
 * the app's data-tour="..." handles. Fresh context per theme so the build is
 * shown from scratch (a saved profile would hide it).
 *
 *   DEMO_URL="https://sigint-5154d935429b.herokuapp.com/?ac=1&air=1&gnd=1" \
 *   npx playwright install chromium && npx tsx tests/demo/demo-capture.ts
 *
 * Cyclones are PARKED (no live storm). When one spins up, add a cyclone segment
 * and pin the clock with page.clock.install({ time }) so "X ago"/advisory times
 * read right for the replayed moment.
 *
 * Selectors are verified against source. The one // VERIFY left is the search
 * target in selectTarget() — it depends on whatever is live at capture time.
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";

const DEMO_URL =
  process.env.DEMO_URL ??
  "https://sigint-5154d935429b.herokuapp.com/?ac=1&air=1&gnd=1";

const CHANNELS = ["CBS Miami", "OAN Encore", "Newsmax2", "ABC News"];
const OUT = "demo";
const VIEWPORT = { width: 1680, height: 1050 };
const THEMES = ["dark", "light"] as const;
type Theme = (typeof THEMES)[number];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(page: Page, theme: Theme, name: string) {
  const file = path.join(OUT, theme, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log("  📸", file);
}

/** Smooth, video-friendly drag of an element's handle by (dx, dy). */
async function dragBy(page: Page, selector: string, dx: number, dy: number) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    console.warn("  ⚠ drag handle not found:", selector);
    return;
  }
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps);
    await sleep(18);
  }
  await page.mouse.up();
  await sleep(600);
}

async function dismissWalkthrough(page: Page) {
  const skip = page.getByRole("button", { name: /skip|close|done|got it/i });
  if (await skip.first().isVisible().catch(() => false)) {
    await skip.first().click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function setTheme(page: Page, theme: Theme) {
  await page.locator('[data-tour="settings-button"]').first().click();
  await page
    .getByRole("button", { name: new RegExp(`^${theme}$`, "i") })
    .first()
    .click();
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(400);
}

async function waitForData(page: Page) {
  await page
    .locator('[data-tour="ticker"]')
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await sleep(4_000);
}

async function selectTarget(page: Page) {
  await page.locator('[data-tour="search"]').first().click();
  await page.keyboard.type("a", { delay: 70 }); // VERIFY: type a real callsign/vessel
  await sleep(1_200);
  await page.keyboard.press("Enter").catch(() => {});
  await sleep(1_200);
}

async function pickChannels(page: Page) {
  for (const name of CHANNELS) {
    await page
      .getByRole("button", { name: /select channel/i })
      .first()
      .click()
      .catch(() => {});
    const search = page.getByPlaceholder(/search channels/i);
    await search.fill(name).catch(() => {});
    await sleep(900);
    await page
      .getByText(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
      .first()
      .click()
      .catch(() => {});
    await sleep(2_500); // let HLS reach 'playing'
  }
}

async function capturePass(browser: Browser, theme: Theme) {
  console.log(`\n▶ ${theme} pass`);
  await mkdir(path.join(OUT, theme), { recursive: true });
  const videoDir = path.join(OUT, theme, "video");

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    colorScheme: theme,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  const page = await ctx.newPage();
  await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
  await dismissWalkthrough(page);
  await setTheme(page, theme);
  await waitForData(page);

  // 1) Globe overview
  await shot(page, theme, "01-globe");

  // 2) Select a target, then DRAG its detail panel — panes are movable
  await selectTarget(page);
  await shot(page, theme, "02-detail");
  await dragBy(page, '[data-tour="detail-drag-handle"]', 300, 180);
  await shot(page, theme, "03-detail-moved");

  // 3) Split right → video feed, load the curated channels
  await page.locator('[data-tour="split-right-btn"]').first().click();
  await page.locator('[data-tour="split-menu-video-feed"]').first().click();
  await sleep(1_200);
  await pickChannels(page);
  await shot(page, theme, "04-video");

  // 4) Split down → intel feed → final composed workspace
  await page.locator('[data-tour="split-down-btn"]').first().click();
  await page.locator('[data-tour="split-menu-intel-feed"]').first().click();
  await sleep(1_500);
  await shot(page, theme, "05-full-layout");

  await sleep(1_500); // tail for the video
  await ctx.close(); // finalizes the webm

  const vids = await readdir(videoDir).catch(() => []);
  const webm = vids.find((f) => f.endsWith(".webm"));
  if (webm) {
    await rename(
      path.join(videoDir, webm),
      path.join(OUT, theme, `demo-${theme}.webm`),
    );
    console.log("  🎞 ", path.join(OUT, theme, `demo-${theme}.webm`));
  }
}

async function main() {
  const browser = await chromium.launch();
  for (const theme of THEMES) await capturePass(browser, theme);
  await browser.close();
  console.log("\n✅ done →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
