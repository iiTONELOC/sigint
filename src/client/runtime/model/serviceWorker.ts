export enum ServiceWorkerCache {
  Prefix = "sigint-shell-",
}

export enum ServiceWorkerPath {
  Api = "/api/",
  Root = "/",
  Script = "/sw.js",
}

export enum ServiceWorkerRequestMethod {
  Get = "GET",
}

export enum ServiceWorkerRequestMode {
  Navigate = "navigate",
}

export const SERVICE_WORKER_UPDATE_CHECK_MS = 900_000;

export const SERVICE_WORKER_UPDATED_FLAG = "sigint.updated";

export const SERVICE_WORKER_UPDATE_VIA_CACHE: ServiceWorkerUpdateViaCache = "none";
