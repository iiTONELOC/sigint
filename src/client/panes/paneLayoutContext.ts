import { useSyncExternalStore } from "react";

let _hasDossier = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return _hasDossier;
}

export function setDossierOpen(value: boolean) {
  if (_hasDossier !== value) {
    _hasDossier = value;
    listeners.forEach((cb) => cb());
  }
}

export function useHasDossier(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Request dossier open (cross-component event) ─────────────────

const dossierRequestListeners = new Set<() => void>();

export function requestDossierOpen() {
  dossierRequestListeners.forEach((cb) => cb());
}

export function onDossierOpenRequest(cb: () => void): () => void {
  dossierRequestListeners.add(cb);
  return () => dossierRequestListeners.delete(cb);
}

// ── Request watch layout (ensures dossier + alerts + intel open) ──

const watchLayoutListeners = new Set<() => void>();

export function requestWatchLayout() {
  watchLayoutListeners.forEach((cb) => cb());
}

export function onWatchLayoutRequest(cb: () => void): () => void {
  watchLayoutListeners.add(cb);
  return () => watchLayoutListeners.delete(cb);
}

// ── Walkthrough layout reset ─────────────────────────────────────
// Walkthrough fires requestWalkthroughReset() → PaneManager listens
// and resets layout to globe-only so the guided tour starts clean.

const walkthroughResetListeners = new Set<() => void>();

export function requestWalkthroughReset() {
  walkthroughResetListeners.forEach((cb) => cb());
}

export function onWalkthroughReset(cb: () => void): () => void {
  walkthroughResetListeners.add(cb);
  return () => walkthroughResetListeners.delete(cb);
}

// ── Walkthrough undo (remove wrong pane) ─────────────────────────
// Walkthrough fires requestWalkthroughUndo(paneType) when user picks
// the wrong pane. PaneManager closes that pane.

const walkthroughUndoListeners = new Set<(paneType: string) => void>();

export function requestWalkthroughUndo(paneType: string) {
  walkthroughUndoListeners.forEach((cb) => cb(paneType));
}

export function onWalkthroughUndo(
  cb: (paneType: string) => void,
): () => void {
  walkthroughUndoListeners.add(cb);
  return () => walkthroughUndoListeners.delete(cb);
}

// ── Walkthrough layout snapshot ──────────────────────────────────
// PaneManager pushes leaf type set here on every layout change.
// Walkthrough reads it via useSyncExternalStore to detect when the
// user has completed an action (e.g. added a data-table pane).

let _leafTypes: Set<string> = new Set(["globe"]);
let _leafCount = 1;
let _presetCount = 0;
const layoutSnapshotListeners = new Set<() => void>();

function subscribeLayoutSnapshot(cb: () => void) {
  layoutSnapshotListeners.add(cb);
  return () => layoutSnapshotListeners.delete(cb);
}

export function setWalkthroughLayoutSnapshot(
  types: Set<string>,
  count: number,
  presets: number,
) {
  _leafTypes = types;
  _leafCount = count;
  _presetCount = presets;
  layoutSnapshotListeners.forEach((cb) => cb());
}

export function useWalkthroughLeafTypes(): Set<string> {
  return useSyncExternalStore(
    subscribeLayoutSnapshot,
    () => _leafTypes,
    () => _leafTypes,
  );
}

export function useWalkthroughLeafCount(): number {
  return useSyncExternalStore(
    subscribeLayoutSnapshot,
    () => _leafCount,
    () => _leafCount,
  );
}

export function useWalkthroughPresetCount(): number {
  return useSyncExternalStore(
    subscribeLayoutSnapshot,
    () => _presetCount,
    () => _presetCount,
  );
}
