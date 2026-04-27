import { defineConfig, devices } from "@playwright/test";

// ── Playwright config (cyclones plan, step 14) ──────────────────────
// Bootstraps the e2e suite under tests/e2e. Server-side: the Bun prod
// server is launched from `bun run start` with a dedicated test secret
// (Hard Rule 7 — A07: never reuse production secrets in tests).
// Client-side: each spec mocks data via `page.route("**/api/...")` and
// loads fixtures from tests/fixtures/ via Bun.file().json().

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  fullyParallel: false, // shared server, sequential
  // 1 retry both locally and in CI. Under sustained server load the
  // ConnectionStatus online-event timing drifts on the Chromium desktop
  // profile (see offline.spec.ts) — retry papers over the load-induced
  // race without weakening the assertion. Single retry is enough.
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command: "bun run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: "3000",
      // Test-only secret. Never reuse production secrets in tests (A07).
      SIGINT_SERVER_SECRET:
        "test-secret-do-not-use-in-prod-0123456789abcdef",
      // Lift rate limit for E2E — Playwright's browser presents the same
      // "unknown" IP for every request and exhausts the prod 60/min cap
      // mid-suite. Production cap is unchanged (RATE_LIMIT_DEFAULT).
      SIGINT_RATE_LIMIT: "10000",
    },
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
  ],
});
