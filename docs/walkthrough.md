# Walkthrough System

[← Back to Docs Index](./README.md)

**Related docs**: [Pane System](./panes.md) · [Rendering](./rendering.md) · [Constraints](./constraints.md)

---

## Overview

`components/Walkthrough.tsx` + `lib/walkthroughSteps.ts` — guided onboarding tour for new users. Two-tier system (essential + advanced) with separate step definitions for desktop and mobile. Renders as a portal overlay with a draggable tooltip, pulsing highlight rings on target elements, and click indicators on the globe.

---

## Architecture

Step definitions live in `walkthroughSteps.ts`; rendering, positioning, and completion detection live in `Walkthrough.tsx`.

**Step types**:
- `"info"` — user reads the tooltip and clicks NEXT to advance
- `"action"` — user performs an action (select a target, split a pane, save a preset), walkthrough detects completion via `completionCheck()` and auto-advances after 600ms

**Highlight rings**: Up to 4 simultaneous pulsing rings per step via `buttonSelector`, `highlightSelector`, `tertiarySelector`, `quaternarySelector`. Each ring tracks its target element via `requestAnimationFrame` and renders as a portaled absolutely-positioned div. Ring colors: cyan (default), warn (yellow), magenta, danger (red).

**Tooltip positioning**: `computeTooltipPos()` uses obstacle avoidance — collects rects from highlight selectors, open menus (`[data-wt-menu]`), click indicators (`[data-wt-indicator]`), and the target cutout. Generates candidate positions (above/below obstacles, viewport corners, directional placement), picks the first non-overlapping position. Search step is special-cased to pin to the absolute bottom of the screen (uses `window.innerHeight` instead of visual viewport to avoid keyboard-shift on mobile). Tooltip is draggable via pointer events.

**Completion detection**: Action steps use `completionCheck()` which receives `(leafTypes, leafCount, presetCount, selectedId, chromeHidden, videoPresetCount)` from `lib/layoutSignals.ts` signals. When the check returns true, the step auto-advances after 600ms. Wrong pane types trigger `requestWalkthroughUndo()` to remove the incorrect pane.

**Persistence**: `walkthroughComplete` flag stored in IndexedDB under `sigint.walkthrough.complete.v1`. SKIP dismisses for the session only (shows again next visit). DON'T SHOW AGAIN persists the flag permanently. Re-launchable from Settings in essential, advanced, or both modes.

---

## Desktop Steps — Essential (Tier 1, 13 steps)

Shown automatically on first visit after a 2.5s delay. Mix of info and action steps.

| # | ID | Type | Title | Action |
|---|---|---|---|---|
| 1 | `welcome` | info | Welcome to SIGINT | Introduction, targets header brand |
| 2 | `layers` | info | Data Layers | Highlights layer toggles |
| 3 | `globe-select` | action | Select a Target | User clicks a point on the globe. Pulsing click indicator over North America. |
| 4 | `globe-drag-detail` | info | Move the Detail Panel | Highlights drag handle, shows dashed landing zone on globe |
| 5 | `globe-deselect` | action | Deselect | User clicks empty space. Click indicator in collision-free position. |
| 6 | `focus-enter` | action | Enter Focus Mode | User clicks empty space to hide chrome. Yellow click indicator. |
| 7 | `focus-exit` | action | Exit Focus Mode | User clicks empty space to restore chrome |
| 8 | `search` | info | Global Search | Highlights search bar, tooltip pinned to screen bottom (avoids keyboard on mobile) |
| 9 | `split-right` | action | Add a Pane — Split Right | User splits globe right → VIDEO FEED. Rings on split-right button + menu item. |
| 10 | `split-down` | action | Add Another — Split Down | User splits globe down → ALERTS. Rings on split-down button + menu item (danger color). |
| 11 | `save-preset` | action | Save Your Layout | User saves a layout preset. Rings on VIEWS button + input + save icon. |
| 12 | `save-video-preset` | action | Save Video Channels | User saves a video channel preset. Magenta rings on bookmark + input + save. |
| 13 | `ticker` | info | Live Feed | Highlights ticker at bottom |

After essential steps, a transition prompt offers the advanced tier ("NICE WORK — Want to explore advanced features?"). Declining completes the walkthrough permanently.

---

## Desktop Steps — Advanced (Tier 2, 5 steps)

Opt-in only. All info steps.

| # | ID | Title | Highlights |
|---|---|---|---|
| 1 | `aircraft-filter` | Aircraft Filters | Filter control dropdown |
| 2 | `watch-mode` | Watch Mode | Globe controls area |
| 3 | `globe-controls` | Globe Controls | Flat/globe toggle, rotation |
| 4 | `settings` | Settings | Settings button |
| 5 | `complete` | You're Ready | Final message |

---

## Mobile Steps — Essential (11 steps)

Mobile uses a separate step set adapted for touch interaction. No focus mode (disabled on mobile). Bottom sheet instead of drag-to-move. All placements are `"center"`. Action steps render as a compact single-line bar (`[step/total] Title DO THIS [× SKIP]`) instead of a full tooltip.

| # | ID | Type | Title | Action |
|---|---|---|---|---|
| 1 | `welcome` | info | Welcome to SIGINT | Introduction |
| 2 | `layers` | info | Data Layers | Highlights layer toggles |
| 3 | `globe-select` | action | Select a Target | User taps a point on the globe |
| 4 | `mobile-detail-sheet` | action | Detail Panel | User taps ✕ to close bottom sheet. Danger-colored ring on close button. |
| 5 | `search` | info | Global Search | Highlights search, tooltip pinned to screen bottom |
| 6 | `split-down` | action | Add VIDEO FEED | User splits globe down → VIDEO FEED. Ring on split-down button + menu item. |
| 7 | `save-video-preset` | action | Save Video Channels | Magenta rings on bookmark + input + save icon |
| 8 | `split-down-alerts` | action | Add ALERTS | User splits VIDEO FEED pane down → ALERTS. Danger-colored ring on menu item. |
| 9 | `split-right-alerts` | action | Add INTEL FEED | User splits ALERTS pane right → INTEL FEED. Ring on split-right button + menu item. |
| 10 | `save-preset` | action | Save Your Layout | User saves a layout preset via VIEWS |
| 11 | `mobile-complete` | info | You're All Set | Final message |

Mobile has **no advanced tier** — aircraft filters, watch mode, and globe controls don't work well on small screens.

---

## Mobile `data-tour` Selectors

Mobile pane headers (`PaneMobile.tsx`) use type-specific `data-tour` attributes for split buttons:

| Pane type | Split-down selector | Split-right selector |
|---|---|---|
| Globe | `split-down-btn` (special case) | `split-right-btn` (special case — desktop only via `PaneHeader`) |
| Video Feed | `split-down-video-feed` | `split-right-video-feed` |
| Alert Log | `split-down-alert-log` | `split-right-alert-log` |
| Intel Feed | `split-down-intel-feed` | `split-right-intel-feed` |
| _(any type)_ | `split-down-{paneType}` | `split-right-{paneType}` |

Split menu items use `split-menu-{paneType}` (e.g., `split-menu-video-feed`, `split-menu-alert-log`).

Desktop `PaneHeader.tsx` only sets `data-tour` on globe pane split buttons (`split-right-btn`, `split-down-btn`). Other pane types on desktop don't have `data-tour` attributes on their split buttons since the desktop walkthrough only splits from the globe.

---

## Component Features

- **Colorized descriptions**: Keywords like AIRCRAFT, ALERTS, VIDEO FEED, INTEL FEED are colorized using theme CSS variables via `colorizeDescription()`
- **Click indicators**: Globe action steps (select, deselect, focus) show a pulsing dot with expanding rings at a computed position on the globe canvas, with a label ("CLICK A POINT" or "CLICK EMPTY SPACE"). Position computed from canvas rect + globe radius, with collision avoidance against detail panel and tooltip.
- **Landing zone**: The drag-detail step shows a dashed "DROP HERE" zone on the globe. Detects drop via pointer events + position check against the zone rect.
- **Mobile compact bar**: Action steps on mobile render as a minimal single-line bar instead of the full tooltip — saves screen space for the actual interaction.
- **Undo protection**: If the user adds the wrong pane type during an action step, `requestWalkthroughUndo()` removes it automatically via `lib/layoutSignals.ts`.
- **Baseline tracking**: Preset count steps track the baseline count at step entry, so pre-existing presets don't trigger false completion.
- **Phase transition**: After essential steps complete, a modal prompt offers the advanced tier with YES/NO buttons. Declining persists the `walkthroughComplete` flag.
- **Escape to skip**: Pressing Escape skips for the session (does not persist).
- **Back button**: Available on all non-first steps. Going back to `globe-select` automatically deselects so the completion check resets.

---

## Z-Index Stack

| z-index | Component |
|---|---|
| z-[9996] | Click indicator, landing zone |
| z-[9998] | Highlight rings |
| z-[9999] | Walkthrough overlay (tooltip, backdrop, cutout) |