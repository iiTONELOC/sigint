# Global Search

[Back to the documentation index](./README.md)

Related documents: [Data flow](./data-flow.md), [Rendering](./rendering.md), and [Feature system](./features.md).

## Purpose

Global search has two paths. One path supplies bounded result rows to React. The other path controls globe visibility in the workers.

## Result search

`Search.tsx` normalizes the current query and calls `useSourceSearch()`.

`useSourceSearch()` sends one bounded query to each searchable DataWorker source. The DataWorker performs source-specific matching and returns a capped result page.

React combines the returned pages. It does not scan complete geographic source arrays.

The searchable geographic sources are:

- Aircraft
- Ships
- Events
- Earthquakes
- Fires
- Weather alerts
- Cyclones

Each source UI-query descriptor supplies the search text that the DataWorker uses.

## Result scoring

React scores only the bounded result rows that the DataWorker returns. Each React feature definition supplies presentation search text for this second score. The score controls result order in the search menu.

The result label and secondary text are feature-specific presentation data. They do not change the worker match set.

## Committed globe search

When the operator commits a search, `UIContext` stores the normalized search text. `useRenderCommands()` sends that text to the RenderWorker.

The worker path is:

```text
committed text
  -> RenderWorker search controller
  -> search-interest command
  -> DataWorker source catalog
  -> matching entity identifiers
  -> scene binding
  -> matching scene handles
  -> RenderWorker source layer
```

React does not store or relay the complete set of matching identifiers.

## Search revisions

The RenderWorker assigns a new revision to each committed search change. The DataWorker returns search results with that revision.

The RenderWorker ignores stale search revisions. This rule prevents an old search result from replacing a new result.

## Selection

The RenderWorker stores the selected identity and the isolation mode before a committed search hides that selection.

If the new search excludes the selected entity, the RenderWorker clears the render selection. When the operator clears the search, the RenderWorker can restore the stored selection and isolation mode.

React receives semantic selection events. It requests one current record from the DataWorker for pane presentation.

## Select and locate

A result action can perform these operations:

- Select the result.
- Commit the result search.
- Send a focus command for the selected identity.

The RenderWorker resolves the current scene position. React does not send geographic coordinates for a source record.

## Interface

The header supplies the search slot. The search component owns its menu, result navigation, and keyboard behavior.

The interface supports arrow-key navigation, Enter, Escape, and the Control-K or Command-K shortcut.

## Search rules

- Run full source matching in the DataWorker.
- Return bounded result pages to React.
- Keep committed globe visibility in the worker pair.
- Keep search revisions monotonic.
- Do not store complete match sets in React.
- Resolve focus from the current RenderWorker scene.
