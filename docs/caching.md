# Caching Architecture

[Back to the documentation index](./README.md)

Related documents: [Data flow](./data-flow.md), [Constraints](./constraints.md), and [Pane system](./panes.md).

## Purpose

SIGINT uses the `sigint-cache` IndexedDB database for browser persistence. The DataWorker owns the database connection and all database transactions.

The service worker has a different purpose. It caches application assets and navigation responses. It does not own live source data.

## DataWorker cache store

`src/client/workers/data/cacheStore.ts` owns the IndexedDB implementation.

The current database policy is:

| Setting | Value |
| --- | --- |
| Database | `sigint-cache` |
| Version | `1` |
| Object store | `cache` |
| Compression threshold | 16,384 bytes |
| Minimum deferred-write interval | 5 seconds |

The cache store uses `CompressionStream` when the browser supports it. A value below the threshold remains in its original structured-clone form.

The cache store waits for transaction completion before it reports a successful write.

## Source cache path

Each geographic source owner reads and writes its cache in the DataWorker.

```text
IndexedDB
  -> source cache parser
  -> DatasetStore rebase
  -> source status
  -> scene rebase
```

After a successful refresh, the source runtime persists the accepted source records and their observation time.

A failed refresh retains valid records. The source status reports the failure and the retained cache state.

## Cache key registry

`src/client/lib/cache/cacheKeys.ts` is the cache-key registry.

The registry includes these categories:

- Geographic source records
- Aircraft dossiers
- Cyclone dossiers
- Trails
- Land and airport data
- Desktop and mobile pane layouts
- Layout presets
- Video state and presets
- Theme and color preferences
- News state
- Correlation baseline
- Dismissed alerts
- Ticker settings
- Walkthrough and user preferences

Change `CACHE_KEYS` when a stored data shape needs a new key. Do not create a cache-key string in a feature module.

## Main-thread compatibility service

`storageService.ts` gives main-thread features access to compatible cache operations. It uses the shared DataWorker client.

The service keeps a small memory map for main-thread consumers. The DataWorker remains the IndexedDB owner.

At boot, the service imports compatible legacy `localStorage` values for aircraft, trails, and land. It removes a legacy value only after a successful import.

## Deferred writes

`createDeferredWriteCoordinator()` controls delayed writes.

A clear or delete operation advances the write generation. A pending write commits only when its captured generation is still current.

This rule prevents a delayed write from restoring deleted data.

The application flushes pending main-thread writes when the document becomes hidden and during `pagehide`.

## Trail cache

The DataWorker owns `sigint.trails.v1`. The trail recorder hydrates this cache before source owners start.

`ObservedTrailBinding` records accepted aircraft and ship observations. React does not record trails.

The current trail policy is:

| Setting | Aircraft | Ships |
| --- | --- | --- |
| Minimum movement | 0.001 degrees | 0.0002 degrees |
| Maximum points | 120 | 500 |
| Stale time | 15 minutes | 1 hour |
| Maximum extrapolation | 10 minutes | 30 minutes |

The trail recorder persists changed trails at intervals greater than 10 seconds. It removes stale entries during hydration.

When live observations arrive before hydration finishes, the recorder preserves them. It merges older cached history before the live observations.

## Aircraft dossier cache

The DataWorker owns the aircraft dossier service and its cache. The service uses a bounded entry policy and an age policy.

React requests one dossier by entity identifier. React does not read the complete dossier cache.

## Layout caches

`PaneManager` owns desktop and mobile layout state. These layouts use different cache keys.

Layout presets use a shared current key. Legacy desktop and mobile preset keys remain migration inputs.

Do not use a geographic source cache as a pane-state cache.

## Clear operations

The settings interface can clear cache entries through `storageService.ts`. The service sends the operation to the DataWorker.

A full clear performs these operations:

1. Clear the main-thread memory map.
2. Wait for DataWorker initialization.
3. Invalidate deferred writes.
4. Clear the IndexedDB object store.

The next source lifecycle starts from an empty browser cache.

## Cache rules

- Keep IndexedDB access in the DataWorker.
- Keep cache keys in the central registry.
- Persist only validated records.
- Do not mark retained records as fresh after a failed refresh.
- Do not let a deferred write restore deleted data.
- Keep desktop and mobile pane layouts separate.
- Keep service-worker assets separate from live source data.
- Keep trail policy source-specific and bounded.
