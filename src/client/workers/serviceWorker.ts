/// <reference lib="webworker" />

declare const __SIGINT_BUILD_ID__: string;
declare const __SIGINT_PRECACHE_URLS__: readonly string[];
declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = "sigint-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${__SIGINT_BUILD_ID__}`;
const NAVIGATION_ENTRY = "/";
const API_PATH_PREFIX = "/api/";
const ACTIVATION_MESSAGE = "SW_ACTIVATE_WAITING";
const PRECACHE_URLS = [...__SIGINT_PRECACHE_URLS__];

type ActivationCommand = {
  type: typeof ACTIVATION_MESSAGE;
};

function isActivationCommand(value: unknown): value is ActivationCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === ACTIVATION_MESSAGE
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(API_PATH_PREFIX)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cacheRequest =
        request.mode === "navigate" ? NAVIGATION_ENTRY : request;
      const cached = await cache.match(cacheRequest);
      if (cached) return cached;
      return fetch(request);
    }),
  );
});

self.addEventListener("message", (event) => {
  if (isActivationCommand(event.data)) void self.skipWaiting();
});

export {};
