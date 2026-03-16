# Global Search

[← Back to Docs Index](./README.md)

**Related docs**: [Data Flow](./data-flow.md) · [Rendering](./rendering.md) · [Feature System](./features.md)

---

## Overview

Search provides a unified way to find, filter, and zoom to entities across all data layers. It operates in two phases: live dropdown preview while typing, and globe-wide filtering on execution.

---

## Two-Phase Behavior

| Phase | What happens | Globe affected? |
|---|---|---|
| **Typing** | Dropdown shows top 15 results live, grouped by feature type | No |
| **Execute** (Enter or click result) | Commits filter: all matching IDs sent to globe via `searchMatchIds` | Yes — only matching points rendered |
| **Close** (Escape / X / click outside) | Filter cleared, `searchMatchIds` set to null | Yes — all points visible again |

Clicking a result selects + zooms to that specific point AND commits the filter. Pressing Enter with no result highlighted commits the filter without zoom — useful for queries like "737" to see all matches on the globe.

---

## Search Engine

In-memory, no external calls. For each DataPoint, calls `featureRegistry.get(type).getSearchText(data)` to get searchable text.

**Matching**: Query split into words, all words must appear in the search text (case-insensitive).

**Scoring**: Exact match on primary field (100), primary starts with query (+50), word match on primary (+30), word-start match (+15), earlier position bonus.

---

## Search Text per Feature

| Feature | Fields |
|---|---|
| Aircraft | callsign, icao24, acType, registration, operator, manufacturerName, model, categoryDescription, originCountry, squawk |
| Ships | name, flag, vesselType |
| Events | headline, category, source |
| Quakes | location, magnitude, alert, eventType |

---

## Selection Stash/Restore

When a search filter is committed, if the currently selected item is not in the match set, the selection is stashed (along with isolate mode). When the search is cleared, the stashed selection is restored automatically.

---

## Globe Filter Mechanism

1. Search calls `handleSearchMatchIds(Set<string>)` on execute
2. DataContext stores it as `searchMatchIds` state
3. Passed to GlobeVisualization as a prop, synced into `propsRef`
4. `drawPoints()` skips any item not in `searchMatchIds`
5. Isolation modes and layer toggles still apply on top

---

## Zoom-to Mechanism

When a specific result is clicked:

1. `setSelected(item)` — opens detail panel
2. `setZoomToId(item.id)` — triggers camera lock-on + zoom

`zoomToId` is cleared after 100ms so the same item can be re-searched.

---

## UI Integration

Search is rendered into the Header via a `searchSlot` prop. The Header doesn't know about search internals.

Desktop: search icon + "SEARCH" label. Mobile: icon only. Dropdown is z-[60].

Keyboard: arrow keys navigate results, Enter executes, Escape closes, Ctrl+K/Cmd+K opens from anywhere.