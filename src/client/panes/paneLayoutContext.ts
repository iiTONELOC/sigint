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
