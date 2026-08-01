import {
  DomEvent,
  DomVisibilityState,
  ServiceWorkerElementId,
  ServiceWorkerLifecycleState,
  ServiceWorkerMessage,
  ServiceWorkerPath,
  ServiceWorkerTiming,
} from "@/runtime";

type ServiceWorkerRegistrationConfig = {
  onUpdate?: () => void;
  onError?: (error: unknown) => void;
};

let updateCallback: (() => void) | null = null;
let errorCallback: ((error: unknown) => void) | null = null;
let registration: ServiceWorkerRegistration | null = null;
let updateCheck: Promise<void> | null = null;
let registrationStarted = false;
let reloading = false;

function notifyUpdate(): void {
  if (!registration?.waiting) return;
  if (document.getElementById(ServiceWorkerElementId.UpdateBanner)) return;
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
  worker.addEventListener(DomEvent.StateChange, () => {
    if (worker.state === ServiceWorkerLifecycleState.Installed) notifyUpdate();
  });
}

function installUpdateChecks(): void {
  document.addEventListener(DomEvent.VisibilityChange, () => {
    if (document.visibilityState === DomVisibilityState.Visible) {
      checkForUpdate();
    }
  });
  window.addEventListener(DomEvent.Online, () => {
    checkForUpdate();
  });
  window.setInterval(
    () => {
      checkForUpdate();
    },
    ServiceWorkerTiming.UpdateCheckMilliseconds,
  );
}

export function registerSW(config?: ServiceWorkerRegistrationConfig): void {
  updateCallback = config?.onUpdate ?? null;
  errorCallback = config?.onError ?? null;
  if (!("serviceWorker" in navigator)) return;
  if (registrationStarted) return;
  registrationStarted = true;

  navigator.serviceWorker.addEventListener(DomEvent.ControllerChange, () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(ServiceWorkerPath.Script, { scope: ServiceWorkerPath.Root })
    .then((registered) => {
      registration = registered;
      if (registered.installing) watchInstallingWorker(registered.installing);
      registered.addEventListener(DomEvent.UpdateFound, () => {
        if (registered.installing) watchInstallingWorker(registered.installing);
      });
      notifyUpdate();
      installUpdateChecks();
      return checkForUpdate();
    })
    .catch(reportError);
}

export function applyUpdate(): void {
  registration?.waiting?.postMessage({
    type: ServiceWorkerMessage.ActivateWaiting,
  });
}
