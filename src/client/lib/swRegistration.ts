// ── Service Worker registration ──────────────────────────────────────
// Call registerSW() once at boot. Handles registration, update
// detection, and provides onUpdate callback for UI notification.

type SWConfig = {
  onUpdate?: () => void;
};

let updateCallback: (() => void) | null = null;

export function registerSW(config?: SWConfig): void {
  if (!("serviceWorker" in navigator)) return;

  updateCallback = config?.onUpdate ?? null;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      // Check for updates on registration
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          // New SW installed and waiting — there's an update
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            updateCallback?.();
          }
        });
      });

      // Periodic update check — every 30 minutes
      setInterval(
        () => {
          registration.update().catch(() => {});
        },
        30 * 60_000,
      );
    } catch (err) {
      console.warn("[SW] Registration failed:", err);
    }
  });

  // Listen for controller change (new SW activated) — reload to get new assets
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

/** Tell the waiting SW to activate immediately */
export function applyUpdate(): void {
  navigator.serviceWorker?.controller?.postMessage("SW_SKIP_WAITING");
}
