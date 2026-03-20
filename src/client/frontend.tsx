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
import { registerSW } from "./lib/swRegistration";

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

// Fire cacheInit non-blocking — providers use cacheGetAsync which
// reads from IndexedDB directly if the memory cache isn't ready yet.
// App renders immediately, data trickles in as providers resolve.
cacheInit().catch(() => {});

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);

  // Register SW in production only (HMR and SW don't mix)
  registerSW({
    onUpdate: () => {
      // New version available — show a subtle banner
      const banner = document.createElement("div");
      banner.className = "sw-update-banner";
      banner.innerHTML = `
        <span>Update available</span>
        <button onclick="window.location.reload()">RELOAD</button>
        <button onclick="this.parentElement.remove()">✕</button>
      `;
      document.body.appendChild(banner);
    },
  });
}
