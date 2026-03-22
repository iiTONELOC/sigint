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

// Singleton providers — hydrate before first render
import { shipProvider } from "./features/tracking/ships/data/provider";
import { gdeltProvider } from "./features/intel/events/data/provider";
import { fireProvider } from "./features/environmental/fires/data/provider";
import { weatherProvider } from "./features/environmental/weather/data/provider";
import { earthquakeProvider } from "./features/environmental/earthquake/data/provider";
import { newsProvider } from "./panes/news-feed/newsProvider";

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
// 1. Open IDB, load all entries into memoryCache
// 2. Hydrate all singleton providers from memoryCache (parallel)
// 3. THEN render React — hooks read snapshot immediately, data on first paint
// 4. Background: initBaseline/trails/land, provider refreshes stream in via onChange

async function boot() {
  await cacheInit();

  // Hydrate all providers in parallel from memoryCache.
  // Each populates this.cache + this.snapshot so hooks get data on mount.
  await Promise.all([
    shipProvider.hydrate().catch(() => {}),
    gdeltProvider.hydrate().catch(() => {}),
    fireProvider.hydrate().catch(() => {}),
    weatherProvider.hydrate().catch(() => {}),
    earthquakeProvider.hydrate().catch(() => {}),
    newsProvider.hydrate().catch(() => {}),
    // AircraftProvider hydrates inside its hook (client-side OpenSky fetch)
  ]);

  // Non-blocking background work — don't gate render on these
  Promise.all([initBaseline(), initTrails(), initLand()]).catch(() => {});

  // NOW render — providers have cached data, hooks init from snapshot
  if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
  } else {
    createRoot(elem).render(app);
  }

  // Register SW in both dev and prod — requires secure context (HTTPS or localhost)
  registerSW({
    onUpdate: () => {
      const banner = document.createElement("div");
      banner.className = "sw-update-banner";
      banner.innerHTML = `
        <span>Update available</span>
        <button id="sw-reload-btn">RELOAD</button>
        <button id="sw-dismiss-btn">✕</button>
      `;
      document.body.appendChild(banner);

      banner.querySelector("#sw-reload-btn")?.addEventListener("click", () => {
        applyUpdate();
      });
      banner.querySelector("#sw-dismiss-btn")?.addEventListener("click", () => {
        banner.remove();
      });
    },
  });
}

boot();
