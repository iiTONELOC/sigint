export enum ServiceWorkerCache {
  Prefix = "sigint-shell-",
}

export enum ServiceWorkerElementId {
  DismissUpdate = "sw-dismiss-btn",
  ReloadUpdate = "sw-reload-btn",
  UpdateBanner = "sw-update-bar",
}

export enum ServiceWorkerClassName {
  DismissedUpdate = "sw-update-bar-dismissed",
  UpdateBanner = "sw-update-bar",
  UpdateDot = "sw-update-dot",
  UpdateInner = "sw-update-inner",
  UpdateSubtitle = "sw-update-sub",
  UpdateTitle = "sw-update-text",
}

export enum ServiceWorkerLifecycleState {
  Installed = "installed",
}

export enum ServiceWorkerMessage {
  ActivateWaiting = "SW_ACTIVATE_WAITING",
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

export enum ServiceWorkerTiming {
  DismissAnimationMs = 300,
  UpdateCheckMilliseconds = 900_000,
}

export enum ServiceWorkerUpdateText {
  Dismiss = "LATER",
  Reload = "RELOAD NOW",
  Subtitle = "A new version of SIGINT is ready",
  Title = "UPDATE AVAILABLE",
}
