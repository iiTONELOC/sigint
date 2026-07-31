# Walkthrough System

[Back to the documentation index](./README.md)

Related documents: [Pane system](./panes.md), [Rendering](./rendering.md), and [Constraints](./constraints.md).

## Purpose

The walkthrough gives the operator a guided tour of SIGINT. It uses separate desktop and mobile step lists.

`src/client/lib/ui/walkthroughSteps.ts` defines the steps. `src/client/components/Walkthrough.tsx` renders the overlay and detects step completion.

## Start and persistence

`AppShell` checks `sigint.walkthrough.complete.v1` after startup. It starts the walkthrough after 2.5 seconds when the value is not true.

The Settings dialog can start one of these modes:

- Essential steps
- Advanced steps
- Essential and advanced steps

The first walkthrough action requests a globe-only pane layout. `PaneManager` preserves a non-default user layout as a preset when necessary.

The Skip action closes the walkthrough for the current session. The Do Not Show Again action stores the completion value. The Escape key also skips the current session.

## Step contract

Each `WalkthroughStep` contains these fields:

- A unique step identifier
- A target selector
- A title and short description
- A tooltip placement
- An information or action mode
- An optional completion test
- An optional expected pane type
- Up to four highlight selectors
- Optional highlight colors

An information step advances when the operator selects Next.

An action step advances when its completion test returns true. The walkthrough waits 600 milliseconds before it advances.

The completion test receives these bounded values:

- Open pane types
- Open pane count
- Layout preset count
- Selected entity identifier
- Chrome visibility state
- Video preset count

The walkthrough does not read the pane tree directly. `PaneManager` publishes the bounded layout values through `layoutSignals.ts`.

## Layout protection

An action step can declare the pane type that the operator must add.

When the operator adds a different pane type, the walkthrough sends an undo request. `PaneManager` removes the incorrect pane.

Preset steps record the preset count when the step starts. An old preset cannot complete a new save step.

## Desktop essential steps

The desktop essential phase has 13 steps.

| Order | Step | Mode | Required result |
| --- | --- | --- | --- |
| 1 | `welcome` | Information | Read the introduction |
| 2 | `layers` | Information | Review the layer controls |
| 3 | `globe-select` | Action | Select one globe entity |
| 4 | `globe-drag-detail` | Information | Review the detail-panel drag control |
| 5 | `globe-deselect` | Action | Clear the selection |
| 6 | `focus-enter` | Action | Hide the application chrome |
| 7 | `focus-exit` | Action | Restore the application chrome |
| 8 | `search` | Information | Review global search |
| 9 | `split-right` | Action | Add the video-feed pane |
| 10 | `split-down` | Action | Add the alert-log pane |
| 11 | `save-preset` | Action | Save one new layout preset |
| 12 | `save-video-preset` | Action | Save one new video preset |
| 13 | `ticker` | Information | Review the live ticker |

After the essential phase, the full desktop tour offers the advanced phase. An essential-only launch completes without this prompt.

## Desktop advanced steps

The desktop advanced phase has five information steps.

| Order | Step | Subject |
| --- | --- | --- |
| 1 | `aircraft-filter` | Aircraft filters |
| 2 | `watch-mode` | Watch mode |
| 3 | `globe-controls` | Projection and rotation controls |
| 4 | `settings` | Settings |
| 5 | `complete` | Completion message |

## Mobile essential steps

The mobile essential phase has 11 steps. The mobile walkthrough has no advanced phase.

| Order | Step | Mode | Required result |
| --- | --- | --- | --- |
| 1 | `welcome` | Information | Read the introduction |
| 2 | `layers` | Information | Review the layer controls |
| 3 | `globe-select` | Action | Select one globe entity |
| 4 | `mobile-detail-sheet` | Action | Clear the selection through `detail-close` |
| 5 | `search` | Information | Review global search |
| 6 | `split-down` | Action | Add the video-feed pane |
| 7 | `save-video-preset` | Action | Save one new video preset |
| 8 | `split-down-alerts` | Action | Add the alert-log pane |
| 9 | `split-right-alerts` | Action | Add the intelligence-feed pane |
| 10 | `save-preset` | Action | Save one new layout preset |
| 11 | `mobile-complete` | Information | Complete the mobile tour |

### Current mobile detail mismatch

The `mobile-detail-sheet` step still targets `[data-tour="detail-close"]`.

The current `LiveTrafficPane` does not mount `DetailPanel` in a mobile layout. A mobile selection requests the dossier pane instead. Therefore, the expected `detail-close` control is not present in the mobile globe pane.

The step definition must change before the expected mobile close action can work. The current product behavior is the dossier-pane path that [Pane system](./panes.md) describes.

## Overlay placement

`computeTooltipPos()` uses the current visual viewport. It treats these items as obstacles:

- Highlighted controls
- Open walkthrough menus
- Globe click indicators
- The current target cutout

The function tests positions above and below obstacles. It also tests viewport edges and the requested direction. It uses the first position that does not overlap an obstacle.

The search step uses the full window height. This rule keeps the tooltip below the search area when a mobile keyboard changes the visual viewport.

The operator can drag the tooltip. A step change clears the drag offset.

## Highlight and action aids

The walkthrough can show four pulsing highlight rings. Each ring follows its target with `requestAnimationFrame`.

Globe action steps can show a click indicator. The indicator identifies a point-selection action, a deselection action, or a focus-mode action.

The desktop detail-panel step shows a landing zone. Dropping the panel in this zone advances the step.

Mobile action steps use a compact instruction bar.

## Pane selectors

Mobile pane headers use pane-specific split selectors.

| Pane type | Down selector | Right selector |
| --- | --- | --- |
| Globe | `split-down-btn` | `split-right-btn` |
| Video feed | `split-down-video-feed` | `split-right-video-feed` |
| Alert log | `split-down-alert-log` | `split-right-alert-log` |
| Intelligence feed | `split-down-intel-feed` | `split-right-intel-feed` |

Split-menu items use `split-menu-{paneType}`.

Desktop walkthrough steps use only the globe split-button selectors.

## Layer order

| Layer | CSS z-index |
| --- | --- |
| Click indicator and landing zone | `9996` |
| Highlight rings | `9998` |
| Walkthrough overlay | `9999` |

## Walkthrough rules

- Keep step definitions in `walkthroughSteps.ts`.
- Keep layout mutation in `PaneManager`.
- Publish only bounded layout values to the walkthrough.
- Reset preset baselines when a save step completes.
- Keep mobile and desktop step lists separate.
- Verify that each selector exists in the active layout mode.
- Update a step when the product replaces its target control.
