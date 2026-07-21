/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */
import "./disablePerfTracks"; // MUST be first — runs before react-dom loads
import { App } from "./App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { cacheInit } from "./lib/cache/storageService";
import { initBaseline } from "./lib/correlation";
import { initTrails } from "./lib/geo/trailService";
import { initLand } from "./lib/geo/landService";
import { initAirports } from "./lib/geo/airportService";
import { registerSW, applyUpdate } from "./lib/runtime/swRegistration";
import { ensureAuthCookie } from "./lib/net/authService";
import { registerRenderSurfaceElement } from "./render-surface/registration";

registerRenderSurfaceElement();

// Singleton providers
import { shipProvider } from "./features/tracking/ships/data/provider";
import { gdeltProvider } from "./features/intel/events/data/provider";
import { weatherProvider } from "./features/environmental/weather/data/provider";
import { newsProvider } from "./features/news";
import { aircraftProvider } from "./features/tracking/aircraft/hooks/useAircraftData";
import { cycloneProvider } from "./features/environmental/cyclones";

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
// Each provider streams in independently: hydrate from IDB (notifies the
// UI the instant it has cached data), then refresh from the network and
// notify again when it lands. No batch barrier — the slow feed (aircraft's
// ~60s server sweep) never holds the fast ones hostage, and the globe is
// interactive from frame zero with whatever has resolved so far.

// 1. Render immediately
if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}

// Provider list — typed via the shared DataProvider contract, no cast needed.
const providers = [
  shipProvider,
  gdeltProvider,
  weatherProvider,
  newsProvider,
  aircraftProvider,
  cycloneProvider,
] as const;

type HydrateResult = Awaited<ReturnType<(typeof providers)[number]["hydrate"]>>;

function needsRefresh(result: HydrateResult): boolean {
  // null = no cached data; { stale:true } = cached but expired. Fresh cache skips.
  return (
    !result ||
    (typeof result === "object" && "stale" in result && result.stale)
  );
}

// Auth token once, up front — needed before any authed fetch, but it does
// NOT gate hydrate/first paint (hydrate is local IDB, no auth).
const authReady = ensureAuthCookie().catch(() => {});

// Non-blocking background work — independent of the data feeds.
Promise.all([initBaseline(), initTrails(), initLand(), initAirports()]).catch(
  () => {},
);

void cacheReady.then(() => {
  for (const p of providers) {
    void (async () => {
      const hydrated = await p.hydrate().catch(() => null);
      if (!needsRefresh(hydrated)) return; // fresh cache — already notified
      await authReady;
      await p.refresh().catch(() => {});
    })();
  }
});

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
