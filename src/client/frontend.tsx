/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */
import { App } from "./App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { cacheInit } from "./lib/storageService";
import { initBaseline } from "./lib/correlationEngine";
import { initTrails } from "./lib/trailService";
import { initLand } from "./lib/landService";
import { registerSW, applyUpdate } from "./lib/swRegistration";
import { ensureAuthCookie } from "./lib/authService";

// Singleton providers
import { shipProvider } from "./features/tracking/ships/data/provider";
import { gdeltProvider } from "./features/intel/events/data/provider";
import { fireProvider } from "./features/environmental/fires/data/provider";
import { weatherProvider } from "./features/environmental/weather/data/provider";
import { earthquakeProvider } from "./features/environmental/earthquake/data/provider";
import { newsProvider } from "./features/news";
import { aircraftProvider } from "./features/tracking/aircraft/hooks/useAircraftData";

// Fire cacheInit NOW — runs while the rest of the module parses.
// By the time we await it below, IDB is likely already open.
const cacheReady = cacheInit();

const fontsLink = document.createElement("link");
fontsLink.rel = "stylesheet";
fontsLink.href = "/fonts.css";
document.head.appendChild(fontsLink);

const manifestLink = document.createElement("link");
manifestLink.rel = "manifest";
manifestLink.href = "/manifest.json";
document.head.appendChild(manifestLink);

const appleTouchIcon = document.createElement("link");
appleTouchIcon.rel = "apple-touch-icon";
appleTouchIcon.href = "/icons/icon-192x192.png";
document.head.appendChild(appleTouchIcon);

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);

// ── Boot sequence ────────────────────────────────────────────────────
// 1. Render shell immediately — empty globe, chrome visible
// 2. Await cacheInit (already in-flight) → hydrate ALL from IDB →
//    notify all at once → globe draws cached data in one pass
// 3. Refresh ALL from network → wait until ALL complete →
//    notify all at once → globe redraws in one pass

// 1. Render immediately
if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}

// Provider list
const providers = [
  shipProvider,
  gdeltProvider,
  fireProvider,
  weatherProvider,
  earthquakeProvider,
  newsProvider,
  aircraftProvider,
] as any[];

function muteProviders(): Array<(() => void) | null> {
  const saved = providers.map((p) => p._onChange ?? null);
  providers.forEach((p) => {
    p._onChange = null;
  });
  return saved;
}

function restoreAndNotify(saved: Array<(() => void) | null>): void {
  providers.forEach((p, i) => {
    p._onChange = saved[i];
  });
  providers.forEach((p) => {
    if (p._onChange) p._onChange();
  });
}

(async () => {
  // 2. IDB hydration — one batch
  await cacheReady;

  let saved = muteProviders();
  const hydrationResults = await Promise.all(
    providers.map((p) => p.hydrate().catch(() => null)),
  );
  restoreAndNotify(saved);

  // Non-blocking background work
  Promise.all([initBaseline(), initTrails(), initLand()]).catch(() => {});

  // 3. Determine which providers need a network refresh.
  //    If hydration returned stale data or no data, refresh that provider.
  //    If cache is fresh, skip it entirely.
  const staleProviders = providers.filter((_, i) => {
    const result = hydrationResults[i];
    // null = no cached data, needs fetch
    // { stale: true } = cached but expired, needs fetch
    // { stale: false } = fresh cache, skip
    return !result || result.stale;
  });

  if (staleProviders.length > 0) {
    // Get auth token BEFORE any network requests — avoids 401 → retry round-trips
    await ensureAuthCookie();

    // Ensure aircraft metadata DB is ready before refresh —
    // otherwise applyMetadata can't enrich and military/type data is lost
    const { ensureMetadataDb } =
      await import("./features/tracking/aircraft/data/typeLookup");
    await ensureMetadataDb().catch(() => {});

    // 4. Network refresh — only stale/missing providers, one batch
    saved = muteProviders();
    await Promise.all(staleProviders.map((p) => p.refresh().catch(() => {})));
    restoreAndNotify(saved);
  }
})().catch(() => {});

// Register SW
registerSW({
  onUpdate: () => {
    // Don't double-create
    if (document.getElementById("sw-update-bar")) return;

    const bar = document.createElement("div");
    bar.id = "sw-update-bar";
    bar.className = "sw-update-bar";
    bar.innerHTML = `
      <div class="sw-update-inner">
        <span class="sw-update-dot"></span>
        <span class="sw-update-text">UPDATE AVAILABLE</span>
        <span class="sw-update-sub">A new version of SIGINT is ready</span>
        <button id="sw-reload-btn">RELOAD NOW</button>
        <button id="sw-dismiss-btn">LATER</button>
      </div>
    `;
    document.body.prepend(bar);

    bar.querySelector("#sw-reload-btn")?.addEventListener("click", () => {
      applyUpdate();
    });
    bar.querySelector("#sw-dismiss-btn")?.addEventListener("click", () => {
      bar.classList.add("sw-update-bar-dismissed");
      setTimeout(() => bar.remove(), 300);
    });
  },
});
