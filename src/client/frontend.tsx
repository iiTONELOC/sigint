import { App } from "./App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/theme";
import { cacheInit } from "./lib/cache/storageService";
import { initBaseline } from "./lib/correlation";
import { initLand } from "./lib/geo/landService";
import { initAirports } from "./lib/geo/airportService";
import { registerSW, applyUpdate } from "./lib/runtime/swRegistration";
import { ensureAuthCookie } from "./lib/net/authService";
import { registerRenderSurfaceElement } from "./render-surface/registration";
import {
  DomEvent,
  DomElementTag,
  ServiceWorkerClassName,
  ServiceWorkerElementId,
  ServiceWorkerTiming,
  ServiceWorkerUpdateText,
} from "./runtime";

enum FrontendElementId {
  Root = "root",
}

enum FrontendAssetPath {
  AppleTouchIcon = "/icons/icon-192x192.png",
  Fonts = "/fonts.css",
  Manifest = "/manifest.json",
}

enum FrontendLinkRelation {
  AppleTouchIcon = "apple-touch-icon",
  Manifest = "manifest",
  Stylesheet = "stylesheet",
}

enum FrontendBootstrapErrorKind {
  RootMissing = "The application root element is missing",
}

class FrontendBootstrapError extends Error {
  constructor(readonly kind: FrontendBootstrapErrorKind) {
    super(kind);
    this.name = FrontendBootstrapError.name;
  }
}

registerRenderSurfaceElement();

import { newsProvider } from "./features/news";

const cacheReady = cacheInit();

const fontsLink = document.createElement(DomElementTag.Link);
fontsLink.rel = FrontendLinkRelation.Stylesheet;
fontsLink.href = FrontendAssetPath.Fonts;
document.head.appendChild(fontsLink);

const manifestLink = document.createElement(DomElementTag.Link);
manifestLink.rel = FrontendLinkRelation.Manifest;
manifestLink.href = FrontendAssetPath.Manifest;
document.head.appendChild(manifestLink);

const appleTouchIcon = document.createElement(DomElementTag.Link);
appleTouchIcon.rel = FrontendLinkRelation.AppleTouchIcon;
appleTouchIcon.href = FrontendAssetPath.AppleTouchIcon;
document.head.appendChild(appleTouchIcon);

const rootElement = document.getElementById(FrontendElementId.Root);
if (!rootElement) {
  throw new FrontendBootstrapError(FrontendBootstrapErrorKind.RootMissing);
}
const app = (
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(rootElement));
  root.render(app);
} else {
  createRoot(rootElement).render(app);
}

type HydrateResult = Awaited<ReturnType<typeof newsProvider.hydrate>>;

function needsRefresh(result: HydrateResult): boolean {
  return (
    !result ||
    (typeof result === "object" && "stale" in result && result.stale)
  );
}

const authReady = ensureAuthCookie().catch(() => {});

const backgroundReady = Promise.allSettled([
  initBaseline(),
  initLand(),
  initAirports(),
]);

async function streamNewsProvider(): Promise<void> {
  const hydrated = await newsProvider.hydrate().catch(() => null);
  if (!needsRefresh(hydrated)) return;
  await authReady;
  await newsProvider.refresh().catch(() => {});
}

registerSW({
  onUpdate: () => {
    if (document.getElementById(ServiceWorkerElementId.UpdateBanner)) return;

    const bar = document.createElement(DomElementTag.Container);
    bar.id = ServiceWorkerElementId.UpdateBanner;
    bar.className = ServiceWorkerClassName.UpdateBanner;
    bar.innerHTML = `
      <div class="${ServiceWorkerClassName.UpdateInner}">
        <span class="${ServiceWorkerClassName.UpdateDot}"></span>
        <span class="${ServiceWorkerClassName.UpdateTitle}">${ServiceWorkerUpdateText.Title}</span>
        <span class="${ServiceWorkerClassName.UpdateSubtitle}">${ServiceWorkerUpdateText.Subtitle}</span>
        <button id="${ServiceWorkerElementId.ReloadUpdate}">${ServiceWorkerUpdateText.Reload}</button>
        <button id="${ServiceWorkerElementId.DismissUpdate}">${ServiceWorkerUpdateText.Dismiss}</button>
      </div>
    `;
    document.body.prepend(bar);

    bar
      .querySelector(`#${ServiceWorkerElementId.ReloadUpdate}`)
      ?.addEventListener(DomEvent.Click, applyUpdate);
    bar
      .querySelector(`#${ServiceWorkerElementId.DismissUpdate}`)
      ?.addEventListener(DomEvent.Click, () => {
        bar.classList.add(ServiceWorkerClassName.DismissedUpdate);
        setTimeout(
          () => bar.remove(),
          ServiceWorkerTiming.DismissAnimationMs,
        );
      });
  },
});

await cacheReady;
await streamNewsProvider();
await backgroundReady;
