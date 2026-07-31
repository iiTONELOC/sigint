# Pane System

[Back to the documentation index](./README.md)

Related documents: [Architecture](./architecture.md), [Data flow](./data-flow.md), and [Rendering](./rendering.md).

## Purpose

The pane system controls the application work area. It is independent from globe rendering and source-data ownership.

`PaneManager` owns the pane layout. `AppShell` owns the header and ticker outside the pane layout.

## Pane types

The application has eight pane types.

| Type | Component | Purpose |
| --- | --- | --- |
| `globe` | `LiveTrafficPane` | Globe, map controls, and watch controls |
| `data-table` | `DataTable` | Bounded source tables |
| `dossier` | `Dossier` | Current entity details |
| `intel-feed` | `IntelFeed` | Correlation products |
| `news-feed` | `NewsFeed` | RSS news articles |
| `alert-log` | `AlertLog` | Correlation alerts |
| `raw-console` | `RawConsole` | Selected record or system status |
| `video-feed` | `VideoFeed` | HLS channel grid |

One pane type can appear one time in the active or minimized layout.

## Layout model

The layout is a binary tree.

```text
LayoutState
  root: LayoutNode
  minimized: MinimizedPane[]

LayoutNode
  leaf
    id
    paneType
  split
    id
    direction
    ratio
    children[0]
    children[1]
```

A horizontal split places its children side by side. A vertical split places one child below the other.

The default layout contains one globe leaf.

## Desktop layout

The desktop renderer walks the layout tree recursively.

- A leaf renders `PaneHeader` and its pane component.
- A split renders a CSS grid and one `ResizeHandle`.
- The split ratio controls the two grid tracks.
- The toolbar shows minimized panes and layout presets.

The desktop layout fills the work area. Pane content does not own the application header or ticker.

## Desktop operations

`PaneManager` supports these operations:

- Split a pane
- Close a pane
- Minimize a pane
- Restore a minimized pane
- Change a pane type
- Resize a split
- Swap two pane types
- Move a pane beside another pane
- Save, load, update, and delete a layout preset

A close operation collapses the parent split. The sibling replaces the removed split.

A minimize operation stores the parent direction, ratio, sibling identifier, and child order. A restore operation first tries to rebuild the original relationship.

## Desktop move behavior

Desktop drag uses five target zones.

- The center zone swaps two pane types.
- The top zone inserts the source above the target.
- The bottom zone inserts the source below the target.
- The left zone inserts the source to the left.
- The right zone inserts the source to the right.

An insert operation removes the source leaf and collapses its old parent. It then creates a new split at the target.

## Mobile layout

`PaneMobile` converts the same layout tree to a vertical block list.

The conversion uses these rules:

- A top-level vertical split becomes separate blocks.
- A shallow horizontal split with two leaves remains one side-by-side block.
- A deep horizontal split becomes separate blocks.
- A single leaf becomes one block.

The globe and video panes must remain full width on mobile. `FULL_WIDTH_ONLY` enforces this rule.

## Mobile block behavior

The mobile work area has a sticky tab bar and a scrollable block column.

Each block has a default height. The operator can resize, minimize, move, split, close, or change a block.

`IntersectionObserver` tracks the block in view. The active tab follows that block.

An offscreen block renders a lightweight placeholder instead of its pane component. This rule limits hidden work.

A side-by-side mobile split can minimize one child to a narrow vertical tab. A child can also move out to its own block.

## Mobile move behavior

The operator taps a grip to enter move mode.

Move mode supplies these actions:

- Move above
- Move below
- Move left
- Move right
- Swap

Left and right actions are not available when either pane must remain full width.

## Persistence

Live layouts use device-specific keys.

| Layout | Cache key |
| --- | --- |
| Desktop | `sigint.layout.desktop.v1` |
| Mobile | `sigint.layout.mobile.v1` |

The legacy `sigint.layout.v1` key is a migration input.

Named presets use `sigint.layout.presets.shared.v1`. A preset is available on desktop and mobile.

The loader merges legacy preset lists by preset name. It writes the merged list to the shared key.

## Dossier placement

The dossier is an independent pane. The globe does not render dossier content.

`layoutSignals.ts` supplies a bounded cross-component request. `requestDossierOpen()` asks `PaneManager` to show the dossier.

`PaneManager` performs these operations:

1. Return when the dossier is already active.
2. Restore the dossier when it is minimized.
3. Split the globe and add the dossier when the globe exists.
4. Split the root when the globe does not exist.

On mobile, a current selection requests the dossier pane when the dossier is not open.

`useHasDossier()` supplies one Boolean projection. `LiveTrafficPane` uses it to suppress the desktop overlay detail panel when the dossier pane is open.

## Watch layout

Watch mode sends a layout request through `layoutSignals.ts`.

`PaneManager` makes sure that these panes are available:

- Dossier
- Alert log
- Intelligence feed

The manager restores a minimized pane before it creates a new pane. It uses the globe and alert panes as placement anchors when they are available.

## Walkthrough integration

The walkthrough can request a globe-only layout. `PaneManager` preserves a non-default user layout as a preset before the reset when necessary.

The walkthrough can also request the removal of an incorrect pane. `PaneManager` publishes a bounded layout snapshot for walkthrough completion checks.

These signals do not own the pane tree.

## Globe pane

`LiveTrafficPane` mounts `GlobeVisualization` and the globe controls.

The globe pane sends semantic selection, search, focus, reveal, and globe-state commands. It does not send geographic source arrays.

The render surface owns the canvas lifecycle. The RenderWorker owns frames. See [Rendering](./rendering.md).

## Data table

The data table requests bounded DataWorker pages. It owns table sort, filter, and view state.

A table selection updates the React selected-record copy and sends a semantic selection command to the RenderWorker.

The table does not own the source dataset.

## Dossier

The dossier reads the selected record copy. Hooks can request one fresh entity, one trail, or one dossier from the DataWorker.

A source version can cause a bounded refresh of current dossier data. The dossier does not subscribe to a full source array.

## Intelligence and alert panes

The intelligence and alert panes read correlation results from `DataContext`.

Their item actions can select an entity and send a semantic reveal command to the RenderWorker.

## News pane

The news pane reads `newsArticles` from `DataContext`. News is a non-geographic React provider.

News articles do not enter the DataWorker geographic source catalog or the RenderWorker scene protocol.

## Raw console

The raw console shows one selected record or bounded system status. It does not show a React-owned geographic collection.

## Video pane

The video pane owns its grid, channels, audio selection, and video presets. It does not participate in geographic source ownership.

## Pane rules

- Keep the pane tree in `PaneManager`.
- Keep the globe and dossier as independent panes.
- Keep live desktop and mobile layouts separate.
- Keep named presets shared.
- Keep each pane type unique in the layout.
- Keep hidden mobile blocks lightweight.
- Use bounded signals for cross-component layout requests.
- Use bounded DataWorker queries for geographic pane content.
- Do not make a pane the owner of source records.
