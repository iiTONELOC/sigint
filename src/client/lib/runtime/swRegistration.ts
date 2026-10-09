import {
  DomEvent,
  DomVisibilityState,
  SERVICE_WORKER_UPDATE_CHECK_MS,
  SERVICE_WORKER_UPDATE_VIA_CACHE,
  SERVICE_WORKER_UPDATED_FLAG,
  ServiceWorkerCarryKey,
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
const carriedState = new Map<ServiceWorkerCarryKey, () => unknown>();

function markUpdated(): void {
  try {
    sessionStorage.setItem(SERVICE_WORKER_UPDATED_FLAG, String(Date.now()));
  } catch {
    return;
  }
}

function saveCarriedState(): void {
  for (const [key, read] of carriedState) {
    try {
      sessionStorage.setItem(key, JSON.stringify(read()));
    } catch {
      continue;
    }
  }
}

export function carryAcrossUpdate(
  key: ServiceWorkerCarryKey,
  read: () => unknown,
): () => void {
  carriedState.set(key, read);
  return () => {
    if (carriedState.get(key) === read) carriedState.delete(key);
  };
}

export function takeCarriedState(key: ServiceWorkerCarryKey): unknown {
  try {
    const stored = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (stored === null) return null;
    const parsed: unknown = JSON.parse(stored);
    return parsed;
  } catch {
    return null;
  }
}

export function consumeUpdatedFlag(): boolean {
  try {
    const updated = sessionStorage.getItem(SERVICE_WORKER_UPDATED_FLAG) !== null;
    sessionStorage.removeItem(SERVICE_WORKER_UPDATED_FLAG);
    return updated;
  } catch {
    return false;
  }
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
    markUpdated();
    saveCarriedState();
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
