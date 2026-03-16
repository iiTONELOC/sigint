# Rendering Pipeline

[← Back to Docs Index](./README.md)

**Related docs**: [Architecture](./architecture.md) · [Data Flow](./data-flow.md) · [Constraints](./constraints.md)

---

## GlobeVisualization Architecture

The globe visualization is split into a modular `components/globe/` directory. The main component (`GlobeVisualization.tsx`) is a thin shell that manages refs, the render loop, effects, and tooltip JSX. All rendering logic is extracted into pure functions in separate files.

**React never directly drives rendering.** Props are synced into `propsRef` on every React render, but the animation loop reads from the ref independently at ~60fps. This means data updates (which trigger React re-renders) are picked up on the next animation frame — imperceptible to users.

The globe uses a ResizeObserver on its parent container, so it correctly handles being resized by the PaneManager grid.

| File | Purpose |
|---|---|
| `GlobeVisualization.tsx` | Shell: refs, render loop, effects, tooltip JSX |
| `cameraSystem.ts` | Lock-on follow, lerp, shortest-path rotation, auto-rotate |
| `inputHandlers.ts` | Mouse, touch, wheel, keyboard handler factory |
| `pointRenderer.ts` | Data points, trails, quake age rendering, hit targets |
| `landRenderer.ts` | Coastline polygons, globe clipping |
| `gridRenderer.ts` | Lat/lon grid lines |
| `projection.ts` | projGlobe, projFlat, getFlatMetrics, clampFlatPan |
| `types.ts` | Shared types (Projected, CamState, CamTarget, DragState, etc.) |

---

## Camera System

Target + lerp model for smooth transitions. `updateCamera()` in `cameraSystem.ts` handles all camera state mutation each frame.

- **`camRef`** — current camera state: `{ rotY, rotX, vy, zoomGlobe, zoomFlat, panX, panY }`
- **`camTargetRef`** — animation target: `{ rotY, rotX, zoom, panX, panY, active, lockedId }`

| Action | Effect |
|---|---|
| Single-click a point | Select + lock camera onto it (scroll stays centered on selected) |
| Double-click a point | Select + lock + zoom in to 35 (globe) or 40 (flat) |
| Drag | Breaks lock-on (`lockedId = null`, `active = false`) |
| Scroll wheel (locked) | Adjusts `camTargetRef.zoom`, stays locked and centered |
| Scroll wheel (unlocked) | Directly modifies `camRef` zoom |
| Auto-rotate | Only active when: globe mode, not dragging, not animating to target |

**Shortest-path rotation**: The `rotY` lerp normalizes the difference to `[-π, π]` before interpolating, ensuring the camera always takes the shortest path around the globe.

When locked onto an item in flat map mode, the pan target is calculated using `camTarget.zoom` (the destination zoom) rather than `cam.zoomFlat` (the mid-lerp zoom) to prevent pan/zoom fighting during transitions.

---

## Input Handlers

All input handling is extracted into `inputHandlers.ts` as a factory function:

```typescript
const handlers = createInputHandlers({
  canvas, camRef, camTargetRef, dragRef, sizeRef, propsRef, setTrailTooltip,
});
attachInputHandlers(canvas, handlers);
// cleanup:
detachInputHandlers(canvas, handlers);
```

**Click priority**: Trail waypoint dots on the selected item's trail are checked before data points. This prevents random overlapping aircraft from stealing clicks when you're inspecting a trail.

---

## Interpolation

All moving entities (aircraft, ships) have their positions interpolated between data refreshes for smooth animation. The trail service records actual positions at each refresh and uses speed + heading to extrapolate between them. If data is older than 10 minutes, interpolation returns null (stale). If less than 1 second old, it also returns null (too soon — use raw position).

This means even though OpenSky data refreshes every 4 minutes, aircraft appear to move continuously on screen.

---

## Trail Waypoint Tooltip

When a trail is drawn for the selected item, each waypoint dot is stored as a hit target. Clicking near a waypoint shows an anchored tooltip with altitude, speed, heading, and coordinates at that point in time. The tooltip is repositioned every frame via DOM ref (not React state) — it stays locked to the waypoint as the user pans and zooms. Hides when the point goes behind the globe.

---

## Projection Functions

Two modes, selected by the `flat` prop:

- **Globe** (`projGlobe`): Orthographic projection onto a sphere. Points behind the globe (`z <= 0`) are culled.
- **Flat** (`projFlat`): Equirectangular projection. Supports pan and zoom via `cam.panX`, `cam.panY`, `cam.zoomFlat`.

Both return `{ x, y, z }` where `z` is used for depth sorting (globe) or always positive (flat).

---

## Earthquake Age-Based Rendering

Earthquake points encode both magnitude and age visually.

**Magnitude → Size** (exponential): M1=2px, M3=3.5px, M5=7px, M7+=15px

**Age → Color & Opacity**: Fresh (<1hr) bright green at full opacity, fading to muted green at 0.5 alpha for 7-day-old events. Always visible.

**Magnitude → Pulse**: Earthquakes above M2.5 get a pulsing glow. Intensity scales with magnitude.

Quake rendering is in its own block within `pointRenderer.ts` with an early return, separate from aircraft/ship/event rendering.

---

## Event Age-Based Rendering

GDELT event points use the same age-based rendering pattern as earthquakes, with severity (derived from Goldstein scale) driving size and age driving color/opacity.

**Severity → Size**: Severity 1=2.5px, 2=3.5px, 3=5px, 4=7px, 5=9.5px

**Age → Color & Opacity**: Fresh (<1hr) bright at full opacity, fading to muted at 0.45 alpha for 7-day-old events. Color shifts from the base event color through progressively dimmer amber tones.

**Severity → Pulse**: Events with severity ≥3 get a pulsing glow. Intensity scales with severity.

Event rendering is in its own block within `pointRenderer.ts` with an early return, separate from both quake and aircraft/ship rendering.

---

## Isolation Modes

| Mode | Behavior |
|---|---|
| **FOCUS** | Shows only the selected item's layer type. Other layers hidden. Filters still apply. |
| **SOLO** | Shows only the single selected point. Everything else gone. |

Controlled by `isolateMode` state in DataContext. Detail panel controls toggling between modes. Closing the panel clears isolation.
