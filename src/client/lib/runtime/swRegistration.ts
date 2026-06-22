// ── Service Worker registration ──────────────────────────────────────
// Call registerSW() once at boot. Handles registration, update
// detection, and provides onUpdate callback for UI notification.
//
// Update flow:
//   1. Browser detects new SW (periodic check or navigation)
//   2. New SW installs → enters "waiting" state (does NOT skipWaiting)
//   3. SW posts SW_UPDATE_AVAILABLE to all clients during install
//   4. This code also detects via updatefound + statechange → "installed"
//   5. onUpdate callback fires → shows banner
//   6. User clicks RELOAD → applyUpdate() → posts SW_SKIP_WAITING
//   7. New SW calls skipWaiting → controllerchange fires → page reloads

type SWConfig = {
  onUpdate?: () => void;
};

let updateCallback: (() => void) | null = null;

export function registerSW(config?: SWConfig): void {
  if (!("serviceWorker" in navigator)) return;

  updateCallback = config?.onUpdate ?? null;

  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((registration) => {
      if (registration.waiting) notifyUpdate();

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            notifyUpdate();
          }
        });
      });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_UPDATE_AVAILABLE") notifyUpdate();
      });

      setInterval(() => {
        registration.update().catch(() => {});
      }, 15 * 60_000);
    })
    .catch((err) => {
      console.warn("[SW] Registration failed:", err);
    });

  // Listen for controller change (new SW activated) — reload to get new assets
  // This only fires AFTER applyUpdate() → skipWaiting() → activate
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function notifyUpdate(): void {
  // Allow re-notification if banner was dismissed
  if (document.getElementById("sw-update-bar")) return;
  updateCallback?.();
}

/** Tell the waiting SW to activate immediately */
export function applyUpdate(): void {
  const reg = navigator.serviceWorker?.getRegistration?.();
  if (reg && typeof reg.then === "function") {
    reg.then((r) => {
      if (r?.waiting) {
        r.waiting.postMessage("SW_SKIP_WAITING");
      }
    });
  } else {
    // Fallback — send to controller
    navigator.serviceWorker?.controller?.postMessage("SW_SKIP_WAITING");
  }
}
