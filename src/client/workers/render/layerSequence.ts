export type MarkerLayerDrawers = Readonly<{
  fire: () => void;
  event: () => void;
  earthquake: () => void;
  weather: () => void;
  legacy: () => void;
}>;

export function drawMarkerLayerSequence(
  drawers: MarkerLayerDrawers,
): void {
  drawers.fire();
  drawers.event();
  drawers.earthquake();
  drawers.weather();
  drawers.legacy();
}
