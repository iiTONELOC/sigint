import { SelectionPulseDurationMs, type SelectionIdSetter } from "../model";

function pulseSelectionId(
  setId: SelectionIdSetter,
  id: string,
  durationMs: SelectionPulseDurationMs,
): void {
  setId(id);
  setTimeout(() => setId(null), durationMs);
}

export function revealThenClear(
  setRevealId: SelectionIdSetter,
  id: string,
): void {
  pulseSelectionId(setRevealId, id, SelectionPulseDurationMs.Reveal);
}

export function zoomToThenClear(
  setZoomToId: SelectionIdSetter,
  id: string,
): void {
  pulseSelectionId(setZoomToId, id, SelectionPulseDurationMs.Zoom);
}
