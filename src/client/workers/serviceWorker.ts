/// <reference lib="webworker" />

import {
  DomEvent,
  ServiceWorkerCache,
  ServiceWorkerPath,
  ServiceWorkerRequestMethod,
  ServiceWorkerRequestMode,
} from "@/runtime";

declare const __SIGINT_BUILD_ID__: string;
declare const __SIGINT_PRECACHE_URLS__: readonly string[];
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `${ServiceWorkerCache.Prefix}${__SIGINT_BUILD_ID__}`;
const PRECACHE_URLS = [...__SIGINT_PRECACHE_URLS__];

self.addEventListener(DomEvent.Install, (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener(DomEvent.Activate, (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(ServiceWorkerCache.Prefix) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener(DomEvent.Fetch, (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== ServiceWorkerRequestMethod.Get) return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(ServiceWorkerPath.Api)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cacheRequest =
        request.mode === ServiceWorkerRequestMode.Navigate
          ? ServiceWorkerPath.Root
          : request;
      const cached = await cache.match(cacheRequest);
      if (cached) return cached;
      return fetch(request);
    }),
  );
});
