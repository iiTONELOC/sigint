# Constraints and Important Rules

[Back to the documentation index](./README.md)

Related documents: [Architecture](./architecture.md), [Data flow](./data-flow.md), [Rendering](./rendering.md), and [Caching](./caching.md).

## Runtime

- Bun is the application runtime and build tool.
- React 19 renders the browser interface.
- The production container has no durable writable file system.
- Server memory is disposable.
- IndexedDB is browser persistence.
- The embedded aircraft SQLite database is read-only.

## Data ownership

The DataWorker owns all geographic source records in the browser. React must not own a merged geographic record array.

Each source must have one source owner. The source owner must use a stable identity rule and a monotonic source version.

Use complete and partial snapshot semantics.

- A complete snapshot can infer deletions.
- A partial snapshot cannot infer deletions.
- A failed refresh must not clear valid retained data.

## Render-data path

Use one path for all geographic render data:

```text
DatasetPatch -> scene codec -> scene publisher -> scene protocol -> scene store
```

Do not add a source-specific render protocol. Do not send complete source arrays through React.

## Canvas and render ownership

The RenderWorker owns the visible canvas context after transfer. It also owns the camera, projection, render filters, selection, hit tests, and frame schedule.

The render surface must call `transferControlToOffscreen()` one time for each canvas element. A new render session must use a new element and session identifier.

The main thread must not perform these operations:

- Run the globe frame loop
- Composite worker frames
- Project source coordinates
- Build render search sets
- Build trail geometry
- Mutate RenderWorker state directly

## Worker files

Worker source files are TypeScript files under `src/client/workers/`. The build writes worker entry files under `public/workers/`.

Workers can import shared application modules through the build. Do not duplicate filter or projection logic because of the worker boundary.

Each worker protocol must include a version. Session protocols must also include a session identifier and sequence.

## Direct worker channels

The DataWorker sends scene commands directly to the RenderWorker. It sends source rebases directly to the CorrelationWorker.

React must not relay these record sets.

The direct scene channel also carries selection interest, render search interest, and bounded selection overlays.

## React queries

React can request only the data that a UI surface needs.

Permitted query shapes include:

- One current entity
- One bounded table page
- One bounded ticker page
- One count
- One bounded facet list
- One selected trail
- One dossier

Keep the last valid result visible while a replacement query is active.

## Trails

The DataWorker records aircraft and ship trails. React must not record trails from source snapshots.

Trail policy is source-specific. It controls movement thresholds, point limits, stale time, and extrapolation time.

The render trail comes from `SelectionInterestService`. A pane trail query is not the render-data path.

## Search

The search interface uses bounded DataWorker queries for result rows.

A committed globe search is worker-owned. React sends search text to the RenderWorker. The DataWorker returns scene handles through the direct scene channel.

React must not store the complete globe match set.

## News

News articles are not geographic scene records. They do not enter `DatasetStore`, the scene protocol, or the RenderWorker.

The React news provider supplies news panes and correlation requests.

## Correlation

The CorrelationWorker receives geographic records directly from the DataWorker. React supplies news and the regional baseline.

The inline fallback has no direct data port. It must not present stale geographic records as current records.

## Client and server fetch boundaries

The Bun server must own a source when the source needs one of these controls:

- A protected credential
- CORS support
- A shared provider budget
- Server-side enrichment
- Large response normalization
- A persistent server connection

An approved browser source can fetch directly in the DataWorker. The source owner still controls validation, freshness, retry, and cache rules.

## Static files

The server must expose explicit routes for static directories. Worker entry files use `/workers/*`. Geographic static data uses `/data/*`.

A new static directory requires a server route and a service-worker review.

## IndexedDB

The DataWorker owns the `sigint-cache` database. It performs compression, decompression, transactions, and worker-owned cache migrations.

A clear or delete operation must invalidate pending deferred writes. A deferred write must not restore deleted data.

Transaction completion, not request success, confirms a write.

## Pane layout

Desktop and mobile layouts use different persisted keys. Do not load a desktop split ratio as a mobile layout.

The globe and dossier are independent panes. A selection must not make the globe the owner of dossier layout.

Lazy panes must not start expensive hidden work.

## Service worker

The service worker owns application assets and update activation. It must not cache API responses as authoritative source data.

The update command must target the waiting worker. It must not target the old active controller.

## Security

Protected server routes require the application authentication flow. Client code must use the shared authenticated-fetch service.

The server owns credentials. Do not place provider credentials in browser code, worker messages, URLs, or persisted browser data.

The server security-header policy applies to development and production responses.
