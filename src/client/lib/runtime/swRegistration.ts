type ServiceWorkerRegistrationConfig = {
  onUpdate?: () => void;
  onError?: (error: unknown) => void;
};

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";
const ACTIVATION_MESSAGE = "SW_ACTIVATE_WAITING";
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

let updateCallback: (() => void) | null = null;
let errorCallback: ((error: unknown) => void) | null = null;
let registration: ServiceWorkerRegistration | null = null;
let updateCheck: Promise<void> | null = null;
let registrationStarted = false;
let reloading = false;

function notifyUpdate(): void {
  if (!registration?.waiting) return;
  if (document.getElementById("sw-update-bar")) return;
  updateCallback?.();
}

function reportError(error: unknown): void {
  errorCallback?.(error);
}

function checkForUpdate(): Promise<void> {
  if (!registration) return Promise.resolve();
  if (updateCheck) return updateCheck;

  updateCheck = registration
    .update()
    .then(() => undefined)
    .catch(reportError)
    .finally(() => {
      updateCheck = null;
    });
  return updateCheck;
}

function watchInstallingWorker(worker: ServiceWorker): void {
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed") notifyUpdate();
  });
}

function installUpdateChecks(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
  });
  window.addEventListener("online", () => void checkForUpdate());
  window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
}

export function registerSW(config?: ServiceWorkerRegistrationConfig): void {
  updateCallback = config?.onUpdate ?? null;
  errorCallback = config?.onError ?? null;
  if (!("serviceWorker" in navigator)) return;
  if (registrationStarted) return;
  registrationStarted = true;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  void navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
    .then((registered) => {
      registration = registered;
      if (registered.installing) watchInstallingWorker(registered.installing);
      registered.addEventListener("updatefound", () => {
        if (registered.installing) watchInstallingWorker(registered.installing);
      });
      notifyUpdate();
      installUpdateChecks();
      return checkForUpdate();
    })
    .catch(reportError);
}

export function applyUpdate(): void {
  registration?.waiting?.postMessage({ type: ACTIVATION_MESSAGE });
}
