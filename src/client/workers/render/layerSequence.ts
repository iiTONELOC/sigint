export type MarkerLayerDrawers = Readonly<{
  fire: () => void;
  event: () => void;
  earthquake: () => void;
  legacy: () => void;
}>;

export function drawMarkerLayerSequence(
  drawers: MarkerLayerDrawers,
): void {
  drawers.fire();
  drawers.event();
  drawers.earthquake();
  drawers.legacy();
}
