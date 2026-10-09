import {
  DomEvent,
  DomVisibilityState,
  SERVICE_WORKER_UPDATE_CHECK_MS,
  SERVICE_WORKER_UPDATE_VIA_CACHE,
  ServiceWorkerPath,
} from "@/runtime";

type ServiceWorkerRegistrationConfig = {
  onError?: (error: unknown) => void;
};

let errorCallback: ((error: unknown) => void) | null = null;
let registration: ServiceWorkerRegistration | null = null;
let updateCheck: Promise<void> | null = null;
let registrationStarted = false;
let reloading = false;

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

function installUpdateChecks(): void {
  document.addEventListener(DomEvent.VisibilityChange, () => {
    if (document.visibilityState === DomVisibilityState.Visible) {
      void checkForUpdate();
    }
  });
  window.addEventListener(DomEvent.Online, () => {
    void checkForUpdate();
  });
  window.setInterval(() => {
    void checkForUpdate();
  }, SERVICE_WORKER_UPDATE_CHECK_MS);
}

export function registerSW(config?: ServiceWorkerRegistrationConfig): void {
  errorCallback = config?.onError ?? null;
  if (!("serviceWorker" in navigator)) return;
  if (registrationStarted) return;
  registrationStarted = true;
  let controllerEstablished = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener(DomEvent.ControllerChange, () => {
    if (!controllerEstablished) {
      controllerEstablished = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(ServiceWorkerPath.Script, {
      scope: ServiceWorkerPath.Root,
      updateViaCache: SERVICE_WORKER_UPDATE_VIA_CACHE,
    })
    .then((registered) => {
      registration = registered;
      installUpdateChecks();
      return checkForUpdate();
    })
    .catch(reportError);
}
