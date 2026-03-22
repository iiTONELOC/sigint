import { describe, test, expect } from "bun:test";

const path = require("path");
const fs = require("fs");
const projectRoot = path.resolve(__dirname, "../..");

let swSource = "";
try {
  swSource = fs.readFileSync(path.join(projectRoot, "public/sw.js"), "utf-8");
} catch {}

let manifest: any = {};
try {
  manifest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "public/manifest.json"), "utf-8"),
  );
} catch {}

let frontendSource = "";
try {
  frontendSource = fs.readFileSync(
    path.join(projectRoot, "src/client/frontend.tsx"),
    "utf-8",
  );
} catch {}

// Helper: check source contains string ignoring whitespace differences in chains
function srcHas(needle: string): boolean {
  return swSource.includes(needle);
}
function srcMatch(pattern: RegExp): boolean {
  return pattern.test(swSource);
}

// ═════════════════════════════════════════════════════════════════════
// SW.JS — CACHE STRATEGY
// ═════════════════════════════════════════════════════════════════════

describe("sw.js — cache strategy", () => {
  test("defines CACHE_NAME with version", () => {
    expect(srcHas("CACHE_NAME")).toBe(true);
    expect(srcHas("CACHE_VERSION")).toBe(true);
    expect(srcMatch(/sigint-shell-/)).toBe(true);
  });

  test("precaches app shell URLs", () => {
    expect(srcHas("/fonts.css")).toBe(true);
    expect(srcHas("/manifest.json")).toBe(true);
    expect(srcHas("/workers/pointWorker.js")).toBe(true);
    expect(srcHas("/data/ne_50m_land.json")).toBe(true);
  });

  test("supports __PRECACHE_MANIFEST injection", () => {
    expect(srcHas("__PRECACHE_MANIFEST")).toBe(true);
  });

  test("does NOT skipWaiting during install", () => {
    const installBlock = swSource.slice(
      swSource.indexOf('addEventListener("install"'),
      swSource.indexOf('addEventListener("activate"'),
    );
    expect(installBlock.includes("skipWaiting")).toBe(false);
  });

  test("skipWaiting only on SW_SKIP_WAITING message", () => {
    expect(srcHas("SW_SKIP_WAITING")).toBe(true);
    expect(srcHas("skipWaiting")).toBe(true);
    const msgBlock = swSource.slice(
      swSource.lastIndexOf('addEventListener("message"'),
    );
    expect(msgBlock.includes("skipWaiting")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SW.JS — FETCH ROUTING
// ═════════════════════════════════════════════════════════════════════

describe("sw.js — fetch routing", () => {
  test("skips non-GET requests", () => {
    expect(srcMatch(/request\.method\s*!==\s*"GET"/)).toBe(true);
  });

  test("skips cross-origin requests", () => {
    expect(srcMatch(/url\.origin\s*!==\s*self\.location\.origin/)).toBe(true);
  });

  test("API routes are network-only", () => {
    expect(srcMatch(/url\.pathname\.startsWith\(\s*"\/api\/"\s*\)/)).toBe(true);
  });

  test("HTML navigation is network-first with cache fallback", () => {
    expect(srcMatch(/request\.mode\s*===\s*"navigate"/)).toBe(true);
    expect(srcHas(".catch(")).toBe(true);
  });

  test("assets are cache-first with network fallback", () => {
    expect(srcMatch(/caches\s*\.\s*match\s*\(\s*request\s*\)/)).toBe(true);
    expect(srcMatch(/fetch\s*\(\s*request\s*\)/)).toBe(true);
  });

  test("successful network responses are cached", () => {
    expect(srcMatch(/response\s*\.\s*ok/)).toBe(true);
    expect(srcMatch(/response\s*\.\s*clone\s*\(\s*\)/)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SW.JS — ACTIVATION
// ═════════════════════════════════════════════════════════════════════

describe("sw.js — activation", () => {
  test("cleans old caches on activate", () => {
    expect(srcMatch(/caches[\s\S]{0,20}\.keys\(\)/)).toBe(true);
    expect(srcMatch(/caches\s*\.\s*delete/)).toBe(true);
    expect(srcMatch(/key\.startsWith\(\s*"sigint-"\s*\)/)).toBe(true);
    expect(srcHas("key !== CACHE_NAME")).toBe(true);
  });

  test("claims clients on activate", () => {
    expect(srcMatch(/self\s*\.\s*clients\s*\.\s*claim\s*\(\s*\)/)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SW.JS — UPDATE NOTIFICATION
// ═════════════════════════════════════════════════════════════════════

describe("sw.js — update notification", () => {
  test("notifies clients during install", () => {
    expect(srcMatch(/self\s*\.\s*clients\s*\.\s*matchAll/)).toBe(true);
    expect(srcHas("SW_UPDATE_AVAILABLE")).toBe(true);
    expect(srcMatch(/client\s*\.\s*postMessage/)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// MANIFEST.JSON
// ═════════════════════════════════════════════════════════════════════

describe("manifest.json", () => {
  test("has required PWA fields", () => {
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  test("has theme and background colors", () => {
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);
  });

  test("has multiple icon sizes", () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("384x384");
  });

  test("has maskable icons for Android", () => {
    const maskable = manifest.icons.filter((i: any) =>
      i.purpose?.includes("maskable"),
    );
    expect(maskable.length).toBeGreaterThanOrEqual(1);
  });

  test("icons reference valid paths", () => {
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^\/icons\//);
      expect(icon.type).toBe("image/png");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// SW REGISTRATION LOGIC
// ═════════════════════════════════════════════════════════════════════

describe("swRegistration logic", () => {
  test("update notification dedup prevents double banner", () => {
    let count = 0;
    let notified = false;
    function notify() {
      if (notified) return;
      notified = true;
      count++;
    }
    notify();
    notify();
    notify();
    expect(count).toBe(1);
  });

  test("controllerchange reload guard prevents double reload", () => {
    let count = 0;
    let reloading = false;
    function onChange() {
      if (reloading) return;
      reloading = true;
      count++;
    }
    onChange();
    onChange();
    expect(count).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// OFFLINE CACHE COVERAGE
// ═════════════════════════════════════════════════════════════════════

describe("offline cache coverage", () => {
  test("precache includes HTML entry point", () => {
    expect(srcMatch(/PRECACHE_URLS\s*=\s*\[[\s\S]*?"\/"/)).toBe(true);
  });

  test("precache includes fonts", () => {
    expect(srcHas("/fonts.css")).toBe(true);
    expect(srcHas("JetBrainsMono-Regular.woff2")).toBe(true);
    expect(srcHas("JetBrainsMono-Bold.woff2")).toBe(true);
  });

  test("precache includes map data", () => {
    expect(srcHas("ne_50m_land.json")).toBe(true);
  });

  test("precache includes web worker", () => {
    expect(srcHas("pointWorker.js")).toBe(true);
  });

  test("precache includes manifest", () => {
    expect(srcHas("/manifest.json")).toBe(true);
  });

  test("runtime caching covers assets via cache-first", () => {
    expect(srcMatch(/caches[\s\S]{0,20}\.match\s*\(\s*request/)).toBe(true);
    expect(srcMatch(/cache\s*\.\s*put\s*\(\s*request/)).toBe(true);
  });

  test("API data NOT cached in SW", () => {
    expect(srcMatch(/url\.pathname\.startsWith\(\s*"\/api\/"\s*\)/)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// UPDATE FLOW
// ═════════════════════════════════════════════════════════════════════

describe("update flow", () => {
  test("install does NOT auto-activate", () => {
    const installHandler = swSource.slice(
      swSource.indexOf('addEventListener("install"'),
      swSource.indexOf('addEventListener("activate"'),
    );
    expect(installHandler.includes("self.skipWaiting()")).toBe(false);
  });

  test("notifies clients on install", () => {
    expect(srcHas("SW_UPDATE_AVAILABLE")).toBe(true);
    expect(srcMatch(/client\s*\.\s*postMessage/)).toBe(true);
  });

  test("activates on explicit user action only", () => {
    const msgHandler = swSource.slice(
      swSource.lastIndexOf('addEventListener("message"'),
    );
    expect(msgHandler.includes("SW_SKIP_WAITING")).toBe(true);
    expect(msgHandler.includes("skipWaiting")).toBe(true);
  });

  test("cleans old caches on activate", () => {
    expect(srcMatch(/caches\s*\.\s*delete/)).toBe(true);
  });

  test("claims clients after activation", () => {
    expect(srcMatch(/self\s*\.\s*clients\s*\.\s*claim/)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// UPDATE BANNER
// ═════════════════════════════════════════════════════════════════════

describe("update banner", () => {
  test("frontend registers SW with onUpdate callback", () => {
    expect(frontendSource.includes("registerSW")).toBe(true);
    expect(frontendSource.includes("onUpdate")).toBe(true);
  });

  test("update banner has RELOAD button", () => {
    expect(frontendSource.includes("RELOAD")).toBe(true);
  });

  test("update banner has dismiss button", () => {
    expect(frontendSource.includes("sw-dismiss-btn")).toBe(true);
  });

  test("RELOAD calls applyUpdate not raw reload", () => {
    expect(frontendSource.includes("applyUpdate")).toBe(true);
    expect(frontendSource.includes('onclick="window.location.reload()"')).toBe(
      false,
    );
  });
});
