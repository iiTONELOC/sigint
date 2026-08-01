import { defineConfig, devices } from "@playwright/test";

enum PlaywrightPath {
  Tests = "./e2e",
}

enum PlaywrightTimeMs {
  Assertion = 5_000,
  Standard = 30_000,
}

enum PlaywrightSnapshotRatio {
  MaximumDifference = 0.02,
}

enum PlaywrightWorkerCount {
  SharedServer = 1,
}

enum PlaywrightOutputMode {
  CiReporter = "github",
  LocalReporter = "list",
  RetainTraceOnFailure = "retain-on-failure",
  ScreenshotOnFailure = "only-on-failure",
}

enum PlaywrightTestServer {
  ApplicationUrl = "http://localhost:5500",
  Command = "bun run start",
  RateLimitPerMinute = "10000",
  Secret = "test-secret-do-not-use-in-prod-0123456789abcdef",
}

enum PlaywrightProfileValue {
  DesktopDevice = "Desktop Chrome",
  DesktopName = "chromium-desktop",
  MobileDevice = "Pixel 5",
  MobileName = "chromium-mobile",
}

export default defineConfig({
  testDir: PlaywrightPath.Tests,
  timeout: PlaywrightTimeMs.Standard,
  expect: {
    timeout: PlaywrightTimeMs.Assertion,
    toHaveScreenshot: {
      maxDiffPixelRatio: PlaywrightSnapshotRatio.MaximumDifference,
    },
  },
  workers: PlaywrightWorkerCount.SharedServer,
  reporter: process.env.CI
    ? PlaywrightOutputMode.CiReporter
    : PlaywrightOutputMode.LocalReporter,
  webServer: {
    command: PlaywrightTestServer.Command,
    url: PlaywrightTestServer.ApplicationUrl,
    reuseExistingServer: !process.env.CI,
    timeout: PlaywrightTimeMs.Standard,
    env: {
      PORT: new URL(PlaywrightTestServer.ApplicationUrl).port,
      SIGINT_SERVER_SECRET: PlaywrightTestServer.Secret,
      SIGINT_RATE_LIMIT_PER_MINUTE: PlaywrightTestServer.RateLimitPerMinute,
    },
  },
  use: {
    baseURL: PlaywrightTestServer.ApplicationUrl,
    trace: PlaywrightOutputMode.RetainTraceOnFailure,
    screenshot: PlaywrightOutputMode.ScreenshotOnFailure,
  },
  projects: [
    {
      name: PlaywrightProfileValue.DesktopName,
      use: { ...devices[PlaywrightProfileValue.DesktopDevice] },
    },
    {
      name: PlaywrightProfileValue.MobileName,
      use: { ...devices[PlaywrightProfileValue.MobileDevice] },
    },
  ],
});
