# Feature and Source System

[Back to the documentation index](./README.md)

Related documents: [Architecture](./architecture.md), [Data flow](./data-flow.md), [Rendering](./rendering.md), and [Global search](./search.md).

## Purpose

SIGINT separates source ownership from React presentation.

The point-source registry owns source identity, point types, cache keys, and
client poll cadence. A geographic source class owns retrieval and dataset
behavior in the DataWorker. A feature definition owns React labels, icons,
detail rows, ticker content, and search text.

## Geographic source class

Each geographic source extends `GeoDataSource` and consumes its definition from
the point-source registry.

The class declares these source-specific facts:

- Geographic carrier
- Motion type
- Entity lifetime
- Optional retry interval
- Cache parser
- Fetch function
- Record-change test

The source runtime supplies common cache, refresh, status, reconciliation, and query behavior.

## Source policy

Each point-source registry definition contains these fields:

- Source identifier
- Point type
- Optional interaction point types
- Cache key
- Poll interval

`src/client/workers/data/sources/registry.ts` is the sole owner of those facts.
The source class can add a source-specific retry interval. Each fetch snapshot,
not the registry, states whether its result is complete or partial.

Do not define a second cache key or poll interval in React.

## Source records

Each queryable source record has a stable identifier and a position. A record can also have a timestamp and geometry.

The source owner validates records before they enter `DatasetStore`.

The `DatasetStore` creates versioned rebases and incremental patches. React does not mutate these records.

## Query registration

Each feature's `data/uiQueries.ts` owns its bounded query implementation and
codecs. `src/client/workers/data/queryableSources.ts` binds each queryable
source to these items:

- Entity type
- UI query implementation
- Entity parser
- Query-result parser
- DataWorker command shape
- DataWorker event shape

`SourceCatalog` is the DataWorker runtime registry. It routes hydration, refresh, entity lookup, UI queries, render rebases, and render search.

## Scene binding

Each renderable source has a scene binding. The binding converts `DatasetPatch` records to the common scene protocol.

The binding owns source-specific scene projection. Examples include numeric attributes, string attributes, polygon geometry, polyline geometry, and motion positions.

All bindings publish through `ScenePublisher`.

Do not add a source-specific render channel.

## Render layer

Each render source has one RenderWorker layer. The layer owns its scene schema, filters, projection behavior, hit tests, motion, and drawing.

`RenderLayerCatalog` is the RenderWorker runtime registry. It routes scene commands and semantic interactions by source.

## React feature definition

`FeatureDefinition` contains React presentation behavior.

The current contract contains these fields:

- Point-type identifier
- Label
- Icon and icon properties
- Detail-row builder
- Ticker renderer
- Optional filter control
- Optional search-text builder

`featureRegistry` maps point types to feature definitions. `featureList` supplies the presentation order.

The React feature registry does not own source records or render records.

## Current geographic sources

| Source | Motion | Main geometry |
| --- | --- | --- |
| Aircraft | Moving | Position |
| Ships | Moving | Position |
| Events | Stationary | Position |
| Earthquakes | Stationary | Position |
| Fires | Stationary | Position |
| Weather alerts | Stationary | Polygon |
| Cyclones | Moving | Path |
| Cyclone warnings | Stationary | Polygon |

Cyclone forecast points are interaction records from the cyclone source. They are not a separate source owner.

## Aircraft

The server performs the aircraft tile sweep and metadata enrichment. The DataWorker parses the server response and owns the browser aircraft dataset.

`AircraftSource` declares moving, ephemeral position records. `AircraftSceneBinding` supplies aircraft scene attributes and motion positions.

The DataWorker also owns aircraft trails and aircraft dossier caching.

## Ships

The server collects AIS records. The DataWorker owns the browser ship dataset.

`src/shared/domain/ships.ts` owns the raw server record, normalized Ship point,
AIS vocabularies, and shared Ship metadata. Normalized points carry one
`GeoPoint` position and retain raw AIS facts for presentation and rendering.

`ShipSource` owns the browser request lifecycle and declares moving, ephemeral
position records. `ShipSceneBinding` supplies ship scene attributes and motion
positions.

The DataWorker records ship trails with the ship trail policy.

## Earthquakes

`src/client/features/environmental/earthquake/data/source.ts` acquires and
normalizes the USGS feed. `src/shared/domain/earthquakes.ts` owns the normalized
Earthquake payload and the cross-runtime waveform and tsunami contracts. The
DataWorker owns the cached geographic dataset and publishes its scene patches.

Waveforms and tsunami alerts are bounded dossier data. React sends lifecycle
requests to the DataWorker; the worker performs EarthScope and NWS acquisition.
React presentation components receive the validated results through props and
do not fetch or parse provider records.

## Fires

The server polls the keyless NASA FIRMS 24-hour VIIRS feeds in NOAA-20,
S-NPP, and NOAA-21 failover order. The first nonempty feed supplies the
snapshot. The server does not union the feeds, and it retains the last good
cache when every feed fails or returns no records.

`src/shared/domain/fireDayNight.ts` owns the normalized Fire payload and
confidence vocabulary. The DataWorker owns Fire cache hydration, refresh,
replacement, bounded UI queries, and scene publication. React receives only
source status, bounded query results, and the selected record.

## Environmental and intelligence sources

Earthquake, event, fire, weather, cyclone, and cyclone-warning sources use the same source-runtime and scene-publication path.

Their scene bindings can publish points, polygons, paths, and source-specific attributes through the common scene patch.

## News

News is a non-geographic feature. It does not use `DatasetStore`, `SourceCatalog`, the scene protocol, or `RenderLayerCatalog`.

The React news provider supplies the news pane and correlation requests.

## Add a geographic source

Use this sequence:

1. Define the source record and parser.
2. Define the source in the point-source registry.
3. Implement the `GeoDataSource` class by consuming that registry definition.
4. Define bounded UI queries and codecs in the feature and register them in
   `queryableSources.ts`.
5. Register the source in `SourceCatalog`.
6. Define the scene schema and scene binding.
7. Define the RenderWorker layer.
8. Register the layer in `RenderLayerCatalog`.
9. Add the React feature definition when the source needs React presentation.
10. Add architecture and protocol tests.

The new source must use the common dataset and scene path.

## Source rules

- Keep one source owner.
- Keep source records in the DataWorker.
- Keep React presentation in the feature definition.
- Keep UI query results bounded.
- Keep source versions monotonic.
- Keep scene publication on the common protocol.
- Keep render behavior in the RenderWorker layer.
- Keep non-geographic news outside the scene path.
